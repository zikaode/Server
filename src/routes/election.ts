import express, { NextFunction, Request, Response } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import { Result, body, param, query, validationResult } from 'express-validator'
import validator from 'validator'
import { authenticate, Default } from '../utils/middlewareAuth'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'
import { PublicKey } from '@solana/web3.js';
const prisma = new PrismaClient()

const router = express.Router()
interface Candidate {
    ketuaId: string,
    wakilId: string
}

const checkElectionStatus = async (req: Request, res: Response, next: NextFunction) => {
    const id = req.body.id || req.params.id
    if (!id) {
        return res.status(400).json({ errors: [{ msg: 'Election ID is required' }] })
    }

    try {
        const election = await prisma.election.findUnique({
            where: { id: id }
        })

        if (!election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found' }] })
        }

        if (election.Status === 'TERMINATE') {
            return res.status(403).json({ errors: [{ msg: 'This election has been terminated and cannot be accessed' }] })
        }

        next()
    } catch (error) {
        console.error('Error checking election status:', error)
        res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
}

export const validateTimeHierarchy = (req: Request, res: Response, next: NextFunction) => {
    const { whitelistStart, whitelistEnd, voteStart, voteEnd } = req.body

    const now = new Date()

    // Convert to Date objects if not already
    const whitelistStartDate = new Date(whitelistStart)
    const whitelistEndDate = new Date(whitelistEnd)
    const voteStartDate = new Date(voteStart)
    const voteEndDate = new Date(voteEnd)

    if (whitelistStartDate <= now) {
        return res.status(400).json({ errors: [{ msg: 'whitelistStart must be in the future' }] })
    }
    if (whitelistEndDate <= whitelistStartDate) {
        return res.status(400).json({ errors: [{ msg: 'whitelistEnd must be after whitelistStart' }] })
    }
    if (voteStartDate <= whitelistEndDate) {
        return res.status(400).json({ errors: [{ msg: 'voteStart must be after whitelistEnd' }] })
    }
    if (voteEndDate <= voteStartDate) {
        return res.status(400).json({ errors: [{ msg: 'voteEnd must be after voteStart' }] })
    }

    next()
}

// GET / - Get all elections with pagination and filter
router.get('/', authenticate, [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('search').optional().isString().withMessage('Name must be a string'),
    query('status').optional().isString().withMessage('Status must be a string')
], async (req: Request, res: Response) => {
    const currentDate = new Date()

    // Update status of elections to 'FINISH' if voteEnd has passed
    await prisma.election.updateMany({
        where: {
            AND: [
                { voteEnd: { lt: currentDate } },
                { Status: { notIn: ['DRAFT', 'FINISH'] } }
            ]
        },
        data: { Status: 'FINISH' }
    })

    const { userData } = req.body
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { page = 1, search, status } = req.query
    const limit = 10

    try {
        let whereClause: any = {}
        if (search) {
            whereClause.OR = [
                { name: { contains: search, mode: 'insensitive' } },
                { organization: { contains: search, mode: 'insensitive' } }
            ]
        }

        if (userData?.access === 'ADMIN') {
            // No additional filtering for admin
        } else if (userData?.access === 'SAKSI') {
            whereClause.Status = { not: 'DRAFT' }
        } else {
            whereClause.AND = [
                { Status: { not: 'DRAFT' } },
                { Status: { not: 'TERMINATE' } }
            ]
        }

        // Add status filter if provided
        if (status) {
            whereClause.Status = status
        }

        // Get all distinct statuses
        const statuses = await prisma.election.findMany({
            select: { Status: true },
            distinct: ['Status'],
            where: whereClause,
            orderBy: { updatedAt: 'desc' }
        })

        const result: { [key: string]: { data: any[]; meta: { currentPage: number; totalPages: number; totalItems: number } } } = {}

        for (const { Status: currentStatus } of statuses) {
            const totalItems = await prisma.election.count({
                where: { ...whereClause, Status: currentStatus }
            })

            const totalPages = Math.ceil(totalItems / limit)
            const currentPage = status === currentStatus ? Number(page) : 1
            const offset = (currentPage - 1) * limit

            const elections = await prisma.election.findMany({
                where: { ...whereClause, Status: currentStatus },
                include: {
                    whitelists: { include: { ballot: true } }, candidate: { select: { id: true, ketua: { include: { profile: true } }, wakil: { include: { profile: true } } } },
                    saksi: { select: { id: true, name: true, profile: { select: { image: true } } } }
                },
                skip: offset,
                take: limit,
                orderBy: { updatedAt: 'desc' },
            })

            result[currentStatus] = {
                data: elections,
                meta: {
                    currentPage,
                    totalPages,
                    totalItems
                }
            }
        }

        return res.status(200).json({
            message: 'Success',
            data: result
        })
    } catch (error) {
        console.error('Error fetching elections:', error)
        res.status(500).json({ errors: [{ msg: 'Internal Server Error' }] })
    }
})

// GET /all - Get all elections with pagination and filter - Common Users
router.get('/all', [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('name').optional().isString().withMessage('Name must be a string')
], async (req: Request, res: Response) => {

    const currentDate = new Date()

    // Find elections where voteEnd has passed the current date
    const electionsToUpdate = await prisma.election.findMany({
        where: {
            AND: [
                { voteEnd: { lt: currentDate } },
                { Status: { notIn: ['DRAFT', 'FINISH', 'TERMINATE'] } }
            ]
        },
        include: {
            candidate: true,
            saksi: true
        }
    })

    // Update status of those elections to 'FINISHED'
    const updatePromises = electionsToUpdate.map((election: any) => {
        return prisma.election.update({
            where: { id: election.id },
            data: { Status: 'FINISH' }
        })
    })

    await Promise.all(updatePromises)


    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { page = 1, name } = req.query
    const limit = 10
    const offset = (Number(page) - 1) * limit

    try {
        let whereClause: any = {}

        if (name) {
            whereClause.name = {
                contains: name,
                mode: 'insensitive'
            }
        }
        whereClause.AND = [
            { Status: { not: 'DRAFT' } },
            { Status: { not: 'TERMINATE' } }
        ]
        const allElection = await prisma.election.findMany({
            where: whereClause,
            skip: offset,
            take: limit,
            orderBy: { updatedAt: 'desc' } // Optional: order by name for consistent pagination
        })

        return res.status(200).json({ message: 'Success', Data: allElection })

    } catch (error) {
        console.error('Error fetching elections:', error)
        res.status(500).json({ errors: [{ msg: 'Internal Server Error' }] })
    }
})

// GET SPECIFIED ELECTION
router.get('/:id', Default, async (req, res) => {
    const { userData } = req.body
    try {
        let allElection
        if (!validator.isUUID(req.params.id)) {
            return res.status(400).json({ errors: [{ msg: 'Invalid UUID format' }] })
        }
        if (userData?.access == 'ADMIN') {
            allElection = await prisma.election.findFirst({
                where: { id: req.params.id },
                include: {
                    candidate: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            ketua: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            wakil: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            election: true
                        },
                    }, whitelists: { include: { ballot: { select: { isvalid: true, voteId: true } } } },
                    exception: true,
                    saksi: { include: { profile: { select: { nim: true, jurusan: true, prodi: true, image: true } } } },
                },
            })
        } else if (userData?.access == 'SAKSI') {
            allElection = await prisma.election.findFirst({
                where: { Status: { not: 'DRAFT' }, id: req.params.id },
                include: {
                    candidate: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            ketua: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            wakil: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            election: true
                        },
                    }, whitelists: { include: { ballot: { select: { isvalid: true, voteId: true } } } },
                    exception: true,
                    saksi: { include: { profile: { select: { nim: true, jurusan: true, prodi: true, image: true } } } }
                },
            })
        } else {
            allElection = await prisma.election.findFirst({
                where: {
                    AND: [{ Status: { not: 'DRAFT' } }, { Status: { not: 'TERMINATE' } }],
                    id: req.params.id,
                },
                include: {
                    candidate: {
                        orderBy: { createdAt: 'asc' },
                        select: {
                            id: true,
                            ketua: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            wakil: {
                                select: {
                                    id: true,
                                    name: true,
                                    email: true,
                                    profile: {
                                        select: {
                                            prodi: true,
                                            jurusan: true,
                                            nim: true,
                                            address: true,
                                            image: true,
                                            publicKey: true
                                        },
                                    },
                                },
                            },
                            election: true
                        },
                    }, whitelists: { include: { ballot: { select: { isvalid: true, voteId: true } } } },
                    saksi: { include: { profile: { select: { nim: true, jurusan: true, prodi: true, image: true } } } }
                },
            })
        }

        if (!allElection) {
            return res.status(404).json({ errors: [{ msg: `Data Not Found for UUID : ${req.params.id}` }] })
        }
        return res.status(200).json({ message: 'Success', Data: allElection })
    } catch (error) {
        console.error('Error registering user:', error)
        res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

// CREATE ELECTION - SET CANDIDATE AND SAKSI
router.post(
    '/',
    authenticate,
    [
        body('userData.access').equals('ADMIN').withMessage('Unauthorized access'),
        body('name').isString().withMessage('Name must be a string'),
        body('organization').isString().withMessage('Organization must be a string'),
        body('description').isString().optional(),
        body('candidate').isArray({ min: 1 }).withMessage('Candidate list cannot be empty'),
        body('candidate.*.ketuaId').isUUID().withMessage('Invalid UUID for ketuaId'),
        body('candidate.*.wakilId').isUUID().withMessage('Invalid UUID for wakilId'),
        body('saksi.*').isUUID().withMessage('Invalid UUID for saksi')
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const { userData, name, organization, description, candidate, saksi } = req.body

        const candidateCreate = async (candidate: any[], dataElection: any) => {
            for (const element of candidate) {
                await prisma.candidate.create({
                    data: {
                        balloutCount: 0,
                        ketua: { connect: { id: element.ketuaId } },
                        wakil: { connect: { id: element.wakilId } },
                        election: { connect: { id: dataElection.id } }
                    }
                })
            }
        }

        const userCheck = async (candidate: any[]): Promise<boolean> => {
            for (const element of candidate) {
                if (
                    (await prisma.users.findFirst({ where: { id: element.ketuaId } })) == null ||
                    (await prisma.users.findFirst({ where: { id: element.wakilId } })) == null
                )
                    return false
            }
            return true
        }

        const saksiCheck = async (saksi: string[]): Promise<boolean> => {
            for (const element of saksi) {
                const temp = await prisma.users.findFirst({ where: { id: element } })
                if (temp == null || temp.access !== 'SAKSI') return false
            }
            return true
        }

        try {
            if (userData.access === 'ADMIN') {
                const isSaksiValid = await saksiCheck(saksi)
                if (!isSaksiValid) {
                    return res.status(400).json({ errors: [{ msg: 'User for Saksi Not Found' }] })
                }

                const dataElection = await prisma.election.create({
                    data: {
                        name,
                        organization,
                        description,
                        Status: 'DRAFT',
                        saksi: { connect: saksi.map((id: any) => ({ id })) }
                    }
                })

                const isCandidateValid = await userCheck(candidate)
                if (!isCandidateValid) {
                    await prisma.election.delete({ where: { id: dataElection.id } })
                    return res.status(400).json({ errors: [{ msg: 'User for Candidate Not Found' }] })
                }

                await candidateCreate(candidate, dataElection)
                const data = await prisma.election.findFirst({
                    where: { id: dataElection.id },
                    include: {
                        candidate: true,
                        saksi: true
                    }
                })

                return res.status(201).json({ message: 'Election Created', data: data })
            } else {
                res.status(401).json({ errors: [{ msg: 'Unauthorized!' }] })
            }
        } catch (error) {
            console.error('Error registering Election:', error)
            res.status(500).json({ errors: [{ msg: 'Internal server error', error: error }] })
        }
    }
)

// UPDATE START ELECTION
router.patch(
    '/start/:id',
    authenticate, checkElectionStatus,
    [
        param('id').isUUID().withMessage('Invalid election ID'),
        body('pending').isInt({ min: 0 }).withMessage('Pending time must be a positive integer'),
        body('votetime').isInt({ min: 1 }).withMessage('Vote time must be a positive integer'),
        body('whitelistStart').isISO8601().withMessage('Invalid start date format'),
        body('whitelistEnd').isInt({ min: 1 }).withMessage('Whitelist end time must be a positive integer'),
        body('publicKey')
            .notEmpty().withMessage('PublicKey tidak boleh kosong')
            .custom((value) => {
                try {
                    new PublicKey(value);
                    return true;
                } catch (error) {
                    throw new Error('PublicKey Solana tidak valid');
                }
            })
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const { userData, pending, votetime, whitelistStart, whitelistEnd, publicKey } = req.body
        const whitelistStartDate = new Date(whitelistStart)
        const whitelistEndDate = new Date(whitelistStartDate.getTime() + (whitelistEnd * 60 * 60 * 1000))
        const voteStartDate = new Date(whitelistEndDate.getTime() + (pending * 60 * 60 * 1000))
        const voteEndDate = new Date(voteStartDate.getTime() + (votetime * 60 * 60 * 1000))

        try {
            const electionData = await prisma.election.findFirstOrThrow({
                where: { id: req.params.id }
            })

            if (userData.access === 'ADMIN') {
                if (electionData.Status === 'DRAFT' && !electionData?.whitelistStart) {
                    const data = await prisma.election.update({
                        data: {
                            Status: 'ONGOING',
                            whitelistStart: whitelistStartDate,
                            whitelistEnd: whitelistEndDate,
                            voteStart: voteStartDate,
                            voteEnd: voteEndDate,
                            publicKey
                        },
                        where: {
                            id: req.params.id
                        }
                    })
                    return res.status(200).json({ message: 'Election Berhasil Dimulai!', data: data })
                }
                return res.status(400).json({ errors: [{ msg: 'Election Tidak Dapat Dimulai!', data: { ...electionData, ...req.body } }] })
            } else {
                return res.status(401).json({ errors: [{ msg: 'Unauthorized!' }] })
            }
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                console.error('Election Not Found:', error)
                return res.status(404).json({ errors: [{ msg: error?.message || 'Election Not Found' }] })
            }
            console.error('Error starting election:', error)
            return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }
    }
)

// UPDATE DRAFT ELECTION
router.patch(
    '/draft/:id',
    authenticate, checkElectionStatus,
    [
        param('id').isUUID().withMessage('Invalid election ID'),
        body('userData.access').equals('ADMIN').withMessage('Unauthorized access'),
        body('name').optional().isString().withMessage('Name must be a string'),
        body('organization').optional().isString().withMessage('Organization must be a string'),
        body('description').optional().isString(),
        body('candidate').optional().isArray().withMessage('Candidate must be an array'),
        body('candidate.*.ketuaId').optional().isUUID().withMessage('Invalid UUID for ketuaId'),
        body('candidate.*.wakilId').optional().isUUID().withMessage('Invalid UUID for wakilId'),
        body('saksi').optional().isArray().withMessage('Saksi must be an array'),
        body('saksi.*').optional().isUUID().withMessage('Invalid UUID for saksi')
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const { userData, name, organization, description, candidate, saksi } = req.body

        try {
            const electionData = await prisma.election.findFirstOrThrow({
                where: { id: req.params.id },
                include: { saksi: true }
            })

            if (userData.access !== 'ADMIN') {
                return res.status(401).json({ errors: [{ msg: 'Unauthorized!' }] })
            }

            if (electionData.Status !== 'DRAFT') {
                return res.status(400).json({ errors: [{ msg: 'Election must be in DRAFT status to be edited' }] })
            }

            // Validate and update candidates
            if (candidate) {
                for (const c of candidate) {
                    const ketuaExists = await prisma.users.findFirst({ where: { id: c.ketuaId } })
                    const wakilExists = await prisma.users.findFirst({ where: { id: c.wakilId } })

                    if (!ketuaExists || !wakilExists) {
                        return res.status(400).json({ errors: [{ msg: 'Invalid ketuaId or wakilId' }] })
                    }

                    const existingCandidate = await prisma.candidate.findFirst({
                        where: {
                            ketuaId: c.ketuaId,
                            wakilId: c.wakilId,
                            electionId: electionData.id
                        }
                    })

                    if (!existingCandidate) {
                        await prisma.candidate.create({
                            data: {
                                balloutCount: 0,
                                ketua: { connect: { id: c.ketuaId } },
                                wakil: { connect: { id: c.wakilId } },
                                election: { connect: { id: electionData.id } }
                            }
                        })
                    }
                }

                // Remove candidates not in the new list
                const newCandidateIds = candidate.map((c: any) => [c.ketuaId, c.wakilId])
                await prisma.candidate.deleteMany({
                    where: {
                        electionId: electionData.id,
                        OR: [
                            { ketuaId: { notIn: newCandidateIds.map((c: any) => c[0]) } },
                            { wakilId: { notIn: newCandidateIds.map((c: any) => c[1]) } }
                        ]
                    }
                })
            }

            // Validate and update saksi
            if (saksi) {
                for (const s of saksi) {
                    const saksiExists = await prisma.users.findFirst({ where: { id: s, access: 'SAKSI' } })

                    if (!saksiExists) {
                        return res.status(400).json({ errors: [{ msg: 'Invalid saksi ID or saksi does not have SAKSI access' }] })
                    }

                    const existingSaksi = await prisma.election.findFirst({
                        where: {
                            id: electionData.id,
                            saksi: {
                                some: {
                                    id: s
                                }
                            }
                        }
                    })

                    if (!existingSaksi) {
                        await prisma.election.update({
                            where: { id: electionData.id },
                            data: {
                                saksi: {
                                    connect: { id: s }
                                }
                            }
                        })
                    }
                }

                // Remove saksi not in the new list
                await prisma.election.update({
                    where: { id: electionData.id },
                    data: {
                        saksi: {
                            disconnect: electionData.saksi.filter((s: any) => !saksi.includes(s.id)).map((s: any) => ({ id: s.id }))
                        }
                    }
                })
            }

            const updatedElection = await prisma.election.update({
                where: { id: req.params.id },
                data: {
                    name: name || electionData.name,
                    organization: organization || electionData.organization,
                    description: description || electionData.description
                },
                include: {
                    candidate: true,
                    saksi: true
                }
            })

            return res.status(200).json({ message: 'Election updated successfully', data: updatedElection })
        } catch (error) {
            if (error instanceof PrismaClientKnownRequestError) {
                console.error('Election Not Found:', error)
                return res.status(404).json({ errors: [{ msg: 'Election Not Found', error: error }] })
            }
            console.error('Error updating election:', error)
            return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }
    }
)

// UPDATE ONGOING ELECTION - TIME, WHITELIST, DESCRIPTION
router.patch('/ongoing/:id', authenticate, checkElectionStatus, async (req: Request, res: Response) => {
    try {
        const { id } = req.params
        const { whitelistStart, whitelistEnd, voteStart, voteEnd, description, userData, publicKey } = req.body

        // Check if user is admin
        if (userData.access !== 'ADMIN') {
            return res.status(401).json({ errors: [{ msg: 'Unauthorized!' }] })
        }

        // Get the ongoing election data
        const ongoingElection = await prisma.election.findUnique({
            where: { id }
        })

        if (!ongoingElection) {
            return res.status(404).json({ errors: [{ msg: 'Election not found!' }] })
        }

        // Check if the election status is ongoing
        if (ongoingElection.Status !== 'ONGOING') {
            return res.status(400).json({ errors: [{ msg: 'Election is not ongoing!' }] })
        }

        // Get current date and time
        const currentDate = new Date()

        // Validate and update times based on hierarchy
        const updatedData: any = {}
        const newTimes: any = {}

        // Helper function to set new times based on hierarchy
        const setNewTime = (field: string, newTime: string | undefined, prevTime?: string, text?: string) => {
            if (newTime) {
                const parsedNewTime = new Date(newTime)

                // If prevTime is defined, newTime should be after prevTime
                if (prevTime && parsedNewTime <= new Date(prevTime)) {
                    // Ignore updating if newTime has passed
                    // throw new Error(`Error Time Set.. Update Waktu ${text} Tidak Valid!`)
                }

                // If newTime is after the current time, it's valid
                if (parsedNewTime >= currentDate) {
                    newTimes[field] = parsedNewTime
                }
            }
        }

        // Set new times based on hierarchy
        setNewTime('whitelistStart', whitelistStart, Date().toString(), 'Whitelist Start')
        setNewTime('whitelistEnd', whitelistEnd, newTimes.whitelistStart || ongoingElection.whitelistStart, 'Whitelist End')
        setNewTime('voteStart', voteStart, newTimes.whitelistEnd || ongoingElection.whitelistEnd, 'Vote Start')
        setNewTime('voteEnd', voteEnd, newTimes.voteStart || ongoingElection.voteStart, 'Vote End')

        // Merge new times with ongoing election times
        updatedData.whitelistStart = newTimes.whitelistStart || ongoingElection.whitelistStart
        updatedData.whitelistEnd = newTimes.whitelistEnd || ongoingElection.whitelistEnd
        updatedData.voteStart = newTimes.voteStart || ongoingElection.voteStart
        updatedData.voteEnd = newTimes.voteEnd || ongoingElection.voteEnd

        if (description) updatedData.description = description
        if (publicKey) updatedData.publicKey = publicKey

        // Update the election with new times
        const updatedElection = await prisma.election.update({
            where: { id },
            data: updatedData
        })

        return res.status(200).json({ message: 'Ongoing election updated successfully', data: updatedElection })
    } catch (error: any) {
        console.error('Error updating ongoing election:', error)
        return res.status(500).json({ errors: [{ msg: error?.message || 'Internal Server Error!' }] })
    }
})

// DELETE DRAFT ELECTION
router.delete('/delete/:id', authenticate, checkElectionStatus, async (req: Request, res: Response) => {

    const { id } = req.params
    const { userData } = req.body
    try {
        // Check if user is admin
        if (userData.access !== 'ADMIN') {
            return res.status(401).json({ errors: [{ msg: 'Unauthorized!' }] })
        }

        // Get the ongoing election data
        const Election = await prisma.election.findFirst({
            where: { id },
            include: { candidate: true }
        })

        if (!Election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found!' }] })
        }

        // Check if the election status is ongoing
        if (Election.Status !== 'DRAFT') {
            return res.status(400).json({ errors: [{ msg: 'Election is not Draft!' }] })
        }

        Election.candidate.forEach(async (e) => {
            await prisma.candidate.delete({
                where: { id: e.id }
            })
        });

        const deletedElection = await prisma.election.delete({
            where: { id }
        })

        if (deletedElection) return res.status(200).json({ message: 'Draft Election Successfully to Delete', data: deletedElection })
        return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    } catch (error) {
        console.error('Error terminating election:', error)
        res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

// TERMINATE ELECTION {id, ?note}
router.patch('/terminate', [
    authenticate,
    body('id').notEmpty().withMessage('Election ID is required'),
    body('note').optional().isString()
], async (req: Request, res: Response) => {
    const { id, note = '' } = req?.body
    const userData = req.body.userData

    const validation = validationResult(req)
    if (!validation.isEmpty()) {
        return res.status(400).json({ errors: validation.array() })
    }

    try {
        const election = await prisma.election.findUnique({
            where: { id: id }
        })

        if (!election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found' }] })
        }

        if (election.Status === 'FINISH' || election.Status === 'DRAFT') {
            return res.status(404).json({ errors: [{ msg: 'Has Be ongoing Election to Terminate!' }] })
        }

        if (userData.access === 'ADMIN') {
            // Update the election status to TERMINATE
            const updatedElection = await prisma.election.update({
                where: { id: id },
                data: { Status: 'TERMINATE' }
            })
            return res.status(200).json({ message: 'Election terminated by admin', data: updatedElection })
        } else if (userData.access === 'SAKSI') {
            // Add an exception for the election
            const exception = await prisma.exception.create({
                data: {
                    note: note || '',
                    user: {
                        connect: { id: userData.id }
                    },
                    election: {
                        connect: { id: id }
                    }
                }
            })
            return res.status(200).json({ message: 'Exception noted by saksi', data: exception })
        } else {
            return res.status(403).json({ errors: [{ msg: 'Unauthorized access' }] })
        }

    } catch (error) {
        console.error('Error terminating election:', error)
        res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

// UPDATE TERMINATE ELECTION - DETERMINATE
router.patch('/determinate', [
    authenticate, validateTimeHierarchy,
    body('id').notEmpty().withMessage('Election ID is required'),
    body('whitelistStart').isISO8601().toDate().withMessage('Whitelist start time is required and must be a valid date'),
    body('whitelistEnd').isISO8601().toDate().withMessage('Whitelist end time is required and must be a valid date'),
    body('voteStart').isISO8601().toDate().withMessage('Vote start time is required and must be a valid date'),
    body('voteEnd').isISO8601().toDate().withMessage('Vote end time is required and must be a valid date'),
], async (req: Request, res: Response) => {
    const { id, whitelistStart, whitelistEnd, voteStart, voteEnd } = req.body
    const userData = req.body.userData

    // Validasi input
    const validation = validationResult(req)
    if (!validation.isEmpty()) {
        return res.status(400).json({ errors: validation.array() })
    }

    try {
        const election = await prisma.election.findUnique({
            where: { id: id }
        })

        if (!election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found' }] })
        }

        if (userData.access !== 'ADMIN') {
            return res.status(403).json({ errors: [{ msg: 'Unauthorized access' }] })
        }

        if (election.Status !== 'TERMINATE') {
            return res.status(404).json({ errors: [{ msg: 'Has Be Terminate Election to De-Terminate!' }] })
        }

        // Update the election status and times
        const updatedElection = await prisma.election.update({
            where: { id: id },
            data: {
                Status: 'ONGOING', // Sesuaikan status sesuai kebutuhan Anda
                whitelistStart: new Date(whitelistStart),
                whitelistEnd: new Date(whitelistEnd),
                voteStart: new Date(voteStart),
                voteEnd: new Date(voteEnd),
            }
        })

        return res.status(200).json({ message: 'Election un-terminated successfully', data: updatedElection })

    } catch (error) {
        console.error('Error un-terminating election:', error)
        res.status(500).json({ errors: [{ msg: 'Internal Server Error' }] })
    }
})


export default router

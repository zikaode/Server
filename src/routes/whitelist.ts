import express, { NextFunction, Request, Response } from 'express'
import { Prisma, PrismaClient } from '@prisma/client'
import { Result, body, param, query, validationResult } from 'express-validator'
import { authenticate } from '../utils/middlewareAuth'
import nodemailer from 'nodemailer'
const prisma = new PrismaClient()
const router = express.Router()

const checkElectionStatus = async (req: Request, res: Response, next: NextFunction) => {
    const id = req.body.id

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

const transporter = nodemailer.createTransport({
    service: 'gmail', // You can use any email service
    auth: {
        user: process.env.GMAIL_USER, // Your email address
        pass: process.env.GMAIL_PASS, // Your email password or app-specific password
    },
})

// Function to group by status
const groupByStatus = (whitelists: any[]) => {
    return whitelists.reduce((acc, whitelist) => {
        const { status } = whitelist
        if (!acc[status]) {
            acc[status] = []
        }
        acc[status].push(whitelist)
        return acc
    }, {})
}

// // Function to group by status with pagination
// const groupByStatusWithPagination = async (where: any, limit: number, currentPage: number) => {
//     const groupedWhitelists: { [key: string]: { data: any[], meta: { currentPage: number, totalPages: number, totalItems: number } } } = {}

//     // Fetch all distinct statuses
//     const statuses = await prisma.whitelists.findMany({
//         select: { status: true },
//         distinct: ['status'],
//         where,
//     })

//     for (const { status } of statuses) {
//         const totalItems = await prisma.whitelists.count({
//             where: { ...where, status }
//         })

//         const totalPages = Math.ceil(totalItems / limit)
//         const offset = (currentPage - 1) * limit

//         // Fetch whitelists for the current status with pagination
//         const whitelists = await prisma.whitelists.findMany({
//             where: { ...where, status },
//             skip: offset,
//             take: limit,
//             orderBy: { status: 'asc' }
//         })

//         groupedWhitelists[status] = {
//             data: whitelists,
//             meta: {
//                 currentPage,
//                 totalPages,
//                 totalItems
//             }
//         }
//     }

//     return groupedWhitelists
// }

const sendStatusEmail = async (email: string, status: string, whitelistId: string) => {
    let subject = `Whitelist Status Updated to ${status}`
    let text = `Your whitelist entry status has been updated to ${status}.`

    if (status === 'ACCEPTED') {
        const redirectUrl = `https://your-website.com/whitelist/${whitelistId}` // Set Client Route
        subject = 'Your Whitelist Entry is Accepted'
        text = `Congratulations! Your whitelist entry has been accepted. You can access your whitelist page here: ${redirectUrl}`
    }

    try {
        await transporter.sendMail({
            from: process.env.GMAIL_USER,
            to: email,
            subject: subject,
            text: text,
        })
    } catch (error) {
        console.error('Error sending email:', error)
    }
}

const checkUserAccess = (req: Request, res: Response, next: NextFunction) => {
    const user = req.body.userData
    if (user.access === 'ADMIN') {
        return res.status(403).json({ errors: [{ msg: 'Admin Tidak Dapat Melakukan Aksi Ini!' }] })
    }
    next()
}

router.post('/',
    authenticate, checkUserAccess, checkElectionStatus,
    [
        body('id').notEmpty().withMessage('Election ID is required').isUUID().withMessage('Election ID must be a valid UUID'),
    ],
    async (req: Request, res: Response) => {
        const { address, id } = req.body
        const { userData } = req.body

        // Validate request data
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        try {
            // Fetch the election details
            const election = await prisma.election.findUnique({
                where: { id: id },
            })

            if (!election) {
                return res.status(404).json({ errors: [{ msg: 'Election not found' }] })
            }

            if (!election?.whitelistStart || !election?.whitelistEnd) {
                return res.status(404).json({ errors: [{ msg: 'Whitelist Date Invalid' }] })
            }

            // Check if the election is ongoing and within whitelist period
            const now = new Date()
            if (
                election.Status !== 'ONGOING' ||
                now < new Date(election?.whitelistStart) ||
                now > new Date(election?.whitelistEnd)
            ) {
                return res.status(403).json({ errors: [{ msg: 'Whitelist period is not active' }] })
            }

            const userWhitelist = await prisma.whitelists.findFirst({
                where: { AND: { userId: userData.id, electionId: id } }
            })

            const electionWhitelist = await prisma.whitelists.findFirst({
                where: { AND: { address: address, electionId: id } }
            })

            if (userWhitelist) {
                return res.status(200).json({ message: 'Kamu Telah Masuk Dalam Whitelist' })
            }

            if (electionWhitelist) {
                return res.status(400).json({ errors: [{ msg: 'Address Ini Telah Masuk Pada Daftar Whitelist Pemilihan Ini.. Gunakan Wallet Lainnya!' }] })
            }

            const userProfile = await prisma.profile.findFirst({
                where: { userId: userData.id }
            })

            if (!userProfile || !userProfile.imageKTM) {
                return res.status(400).json({ errors: [{ msg: 'Harap Lengkapi Profile Terlebih Dahulu!' }] })
            }

            // Create the whitelist entry
            const whitelist = await prisma.whitelists.create({
                data: {
                    address,
                    email: userData.email,
                    status: 'PENDING',
                    userId: userData.id,
                    electionId: id,
                },
            })

            res.status(201).json({ message: 'Whitelist Registration Successfully', data: whitelist })
        } catch (error) {
            console.error(error)
            res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }
    }
)

router.put('/accept/:id',
    authenticate, [
    param('id').isUUID().withMessage('Whitelist ID must be a valid UUID'),
    body('status').isIn(['ACCEPT', 'DECLINE']).withMessage('Status must be either ACCEPTED or DECLINED')
], async (req: Request, res: Response) => {

    const whitelistId: any = req.params.id
    const { status } = req.body
    const userData = req.body.userData

    if (userData.access !== 'ADMIN') {
        return res.status(403).json({ message: 'Unauthorized access' })
    }

    // Validate request data
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        // Fetch the whitelist entry
        const whitelist = await prisma.whitelists.findFirst({
            where: { id: whitelistId },
        })

        if (!whitelist) {
            return res.status(404).json({ message: 'Whitelist entry not found' })
        }

        // Update the whitelist entry status
        const updatedWhitelist = await prisma.whitelists.update({
            where: { id: whitelistId },
            data: { status },
        })

        // Send email notification
        await sendStatusEmail(whitelist.email, status, whitelistId)

        res.status(200).json({ message: `Whitelist entry ${status.toLowerCase()} successfully`, data: updatedWhitelist })
    } catch (error) {
        console.error(error)
        res.status(500).json({ message: 'Internal server error' })
    }
})

// GET /whitelists - Get all whitelists grouped by status
router.get('/', authenticate, async (req: Request, res: Response) => {
    const userData = req.body.userData

    if (!['ADMIN', 'SAKSI'].includes(userData.access)) {
        return res.status(403).json({ message: 'Unauthorized access' })
    }

    try {
        const whitelists = await prisma.whitelists.findMany()
        const groupedWhitelists = groupByStatus(whitelists)
        return res.status(200).json({ data: groupedWhitelists })
    } catch (error) {
        console.error('Error fetching whitelists:', error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})

// GET /whitelists - Get whitelists by election ID with pagination and filter
router.get('/:id', authenticate, [
    query('page').optional().isInt({ min: 1 }).withMessage('Page must be a positive integer'),
    query('name').optional().isString().withMessage('Name must be a string')
], async (req: Request, res: Response) => {
    const { userData } = req.body

    if (!['ADMIN', 'SAKSI'].includes(userData.access)) {
        return res.status(403).json({ message: 'Unauthorized access' })
    }

    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    const { id } = req.params
    const { page = 1, name } = req.query
    const currentPage = Number(page)
    const limit = 10
    const offset = (currentPage - 1) * limit

    try {
        const where: any = { electionId: String(id) }
        if (name) {
            where.name = {
                contains: String(name),
                mode: 'insensitive'
            }
        }

        // Get all distinct statuses
        const statuses = await prisma.whitelists.findMany({
            select: { status: true },
            distinct: ['status'],
            where,
        })

        const result: { [key: string]: { data: any[], meta: { currentPage: number, totalPages: number, totalItems: number } } } = {}

        for (const { status } of statuses) {
            const totalItems = await prisma.whitelists.count({
                where: { ...where, status }
            })

            const totalPages = Math.ceil(totalItems / limit)

            const whitelists = await prisma.whitelists.findMany({
                where: { ...where, status },
                skip: offset,
                take: limit,
                orderBy: { status: 'asc' },
                include: {
                    user: { include: { profile: true } },
                    ballot: true,
                    election: true
                }
            })

            result[status] = {
                data: whitelists,
                meta: {
                    currentPage,
                    totalPages,
                    totalItems
                }
            }
        }

        return res.status(200).json({ data: result })
    } catch (error) {
        console.error('Error fetching whitelists:', error)
        return res.status(500).json({ message: 'Internal server error' })
    }
})
export default router

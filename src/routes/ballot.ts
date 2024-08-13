import express, { NextFunction, Request, Response } from 'express'
import { param, body, validationResult } from 'express-validator'
import { PrismaClient } from '@prisma/client'
import { authenticate } from '../utils/middlewareAuth'

const router = express.Router()
const prisma = new PrismaClient()

// enum StatusWhitelist {
//     ACCEPT = 'ACCEPT',
//     PENDING = 'PENDING',
//     DECLINE = 'DECLINE',
// }

const checkElectionStatus = async (req: Request, res: Response, next: NextFunction) => {
    const id = req.body.id || req.params.id
    if (!id) {
        return res.status(400).json({ errors: [{ msg: 'Election ID is required!' }] })
    }

    try {
        const election = await prisma.election.findUnique({
            where: { id: id }
        })

        if (!election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found!' }] })
        }

        if (election.Status === 'TERMINATE') {
            return res.status(403).json({ errors: [{ msg: 'This election has been terminated and cannot be accessed!' }] })
        }

        next()
    } catch (error) {
        console.error('Error checking election status:', error)
        res.status(500).json({ errors: [{ msg: 'Internal server error!' }] })
    }
}


// API Endpoint: POST /vote/:electionId
router.post('/vote/:id',
    authenticate, checkElectionStatus,
    [
        param('id').isUUID().withMessage('Election ID must be a valid UUID'),
        body('candidateId').isUUID().withMessage('Candidate ID must be a valid UUID')
    ],
    async (req: Request, res: Response) => {
        const errors = validationResult(req)
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() })
        }

        const { id } = req.params
        const { candidateId, transaction } = req.body
        const userData = req.body.userData

        // Check if the user is admin
        if (userData.access === 'ADMIN') {
            return res.status(403).json({ errors: [{ msg: 'Admin Tidak Dapat Memilih' }] })
        }

        try {
            // Fetch the election
            const election = await prisma.election.findUnique({
                where: { id: id },
                include: { whitelists: true, candidate: true }
            })

            if (!election) {
                return res.status(404).json({ errors: [{ msg: 'Election/Pemilihan Tidak Ditemukan' }] })
            }

            // Check if the election status is ongoing
            if (election.Status !== 'ONGOING') {
                return res.status(400).json({ errors: [{ msg: 'Election/Pemilihan Harus Dalam Status Ongoing/Berlangsung' }] })
            }

            // Check the current date and time
            const currentDate = new Date().getTime()

            // Validate the voting period
            if (!election?.voteStart || !election?.voteEnd) {
                return res.status(400).json({ errors: [{ msg: 'Vote tidak sesuai jadwal!' }] })
            }

            // Validate the voting period
            if (currentDate < new Date(election.voteStart).getTime() || currentDate > new Date(election.voteEnd).getTime()) {
                return res.status(400).json({ errors: [{ msg: 'Vote tidak sesuai jadwal!' }] })
            }

            // Check if the user is in the approved whitelist for this election
            const approvedWhitelist = election.whitelists.find((whitelist) =>
                whitelist.email === userData.email && whitelist.status as string === 'ACCEPT'
            )

            if (!approvedWhitelist) {
                return res.status(403).json({ errors: [{ msg: 'kamu Tidak/Belum Memenuhi Syarat Untuk Memilih!' }] })
            }

            // Check if the whitelist has no existing ballot
            const existingBallot = await prisma.ballot.findFirst({
                where: {
                    whitelistId: approvedWhitelist.id
                }
            })

            if (existingBallot) {
                return res.status(403).json({ errors: [{ msg: 'Kamu Telah Memilih Pada Pemilihan Ini!' }] })
            }

            // Check if the candidate is part of the election
            const candidate = await prisma.candidate.findUnique({
                where: { id: candidateId }
            })
            if (!candidate || candidate.id !== candidateId) {
                return res.status(404).json({ errors: [{ msg: 'Kandidat Tidak Ada Pada Daftar Pilih!' }] })
            }

            // Increment the vote count for the candidate
            await prisma.candidate.update({
                where: { id: candidateId },
                data: {
                    balloutCount: {
                        increment: 1
                    }
                }
            })

            // Create a new ballot entry
            const ballot = await prisma.ballot.create({
                data: {
                    voteId: candidateId,
                    isvalid: true,
                    whitelistId: approvedWhitelist.id,
                    transaction
                }
            })

            return res.status(200).json({ message: 'Proses Pilih/Vote Berhasil Dilakukan!', data: ballot })
        } catch (error) {
            console.error('Error processing vote:', error)
            return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }
    }
)

// API Endpoint Invalid
router.put('/invalidate/:whitelistId', async (req: Request, res: Response) => {
    const { whitelistId } = req.params
    const { userData } = req.body

    // Check if the user is admin
    if (userData.access !== 'ADMIN') {
        return res.status(403).json({ errors: [{ msg: 'Unauthorized access!' }] })
    }

    try {
        // Fetch the whitelist entry
        const whitelist = await prisma.whitelists.findUnique({
            where: { id: whitelistId },
            include: { ballot: true, election: true }
        })

        if (!whitelist) {
            return res.status(404).json({ errors: [{ msg: 'Whitelist entry not found!' }] })
        }

        if (!whitelist.election.voteEnd) {
            return res.status(404).json({ errors: [{ msg: 'Election VoteEnd is Invalid!' }] })
        }

        // Check if the voting period has ended
        const currentDate = new Date()
        const voteEnd = new Date(whitelist.election.voteEnd)
        const oneDayInMillis = 24 * 60 * 60 * 1000 // One day in milliseconds
        if (currentDate.getTime() > voteEnd.getTime() + oneDayInMillis) {
            return res.status(403).json({ errors: [{ msg: 'Invalid operation. Voting period has ended more than a day ago!' }] })
        }

        // Invalidate all ballots associated with this whitelist entry
        const invalidatedBallots = await prisma.ballot.updateMany({
            where: { whitelistId },
            data: { isvalid: false }
        })

        // Reduce the balloutCount for the associated candidate
        await prisma.candidate.update({
            where: { id: whitelist.ballot?.voteId },
            data: { balloutCount: { decrement: 1 } }
        })

        return res.status(200).json({ message: 'Ballots invalidated successfully', data: invalidatedBallots })
    } catch (error) {
        console.error('Error invalidating ballots:', error)
        return res.status(500).json({ errors: [{ msg: 'Internal server error!' }] })
    }
})

export default router
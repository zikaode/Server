import express, { Request, Response } from 'express'
import { param, body, validationResult } from 'express-validator'
import { PrismaClient } from '@prisma/client'
import { profile } from 'console'

const router = express.Router()
const prisma = new PrismaClient()

// API Endpoint: GET /finished
router.get('/finished', async (req: Request, res: Response) => {
    try {
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

        // Fetch all elections with status 'FINISHED'
        const finishedElections = await prisma.election.findMany({
            where: {
                Status: 'FINISH'
            },
            include: {
                candidate: {
                    select: {
                        id: true,
                        balloutCount: true,
                        ketua: true,
                        wakil: true
                    }
                },
                saksi: true
            }
        })

        // Prepare the response data
        const result = finishedElections.map(election => ({
            id: election.id,
            name: election.name,
            status: election.Status,
            candidates: election.candidate.map(candidate => ({
                id: candidate.id,
                ketua: candidate.ketua,
                wakil: candidate.wakil,
                balloutCount: candidate.balloutCount
            })),
            saksi: election.saksi.map(saksi => ({
                id: saksi.id,
                name: saksi.name,
                email: saksi.email
            }))
        }))

        return res.status(200).json({ data: result })
    } catch (error) {
        console.error('Error fetching completed elections:', error)
        return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

// API Endpoint: GET /finished/:electionId
router.get('/finished/:electionId', [
    param('electionId').isUUID().withMessage('Election ID must be a valid UUID')
], async (req: Request, res: Response) => {
    const { electionId } = req.params
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }

    try {
        // Fetch the finished election with the given ID, including related candidates, saksi, and whitelist data
        const election = await prisma.election.findFirst({
            where: { id: electionId, Status: 'FINISH' },
            include: {
                candidate: {
                    select: {
                        id: true,
                        balloutCount: true,
                        ketua: true,
                        wakil: true
                    }
                },
                saksi: true,
                whitelists: {
                    select: {
                        id: true, status: true, ballot: true
                    },
                }
            }
        })

        const ballot = await prisma.ballot.findMany({
            where: {
                whitelist: {
                    electionId: electionId,
                }
            }, include: { whitelist: { include: { user: { select: { name: true, profile: { select: { publicKey: true } } } } } } }
        })

        if (!election) {
            return res.status(404).json({ errors: [{ msg: 'Election not found or not finished!' }] })
        }

        // Calculate the number of whitelists and the number of voters
        const totalWhitelists = election.whitelists.length
        const totalVoters = ballot.length

        // Find the candidate with the highest balloutCount
        let winner = election.winner

        if (!winner) {
            const topCandidate = election.candidate.reduce((max, candidate) =>
                candidate.balloutCount > max.balloutCount ? candidate : max, election.candidate[0]
            )

            if (topCandidate) {
                winner = topCandidate.id
                // Update the election with the winnerId if it's not already set
                await prisma.election.update({
                    where: { id: election.id },
                    data: { winner }
                })
            }
        }

        // Prepare the response data
        const result = {
            id: election.id,
            name: election.name,
            status: election.Status,
            winner,
            candidates: election.candidate.map(candidate => ({
                id: candidate.id,
                ketua: candidate.ketua,
                wakil: candidate.wakil,
                balloutCount: candidate.balloutCount
            })),
            saksi: election.saksi.map(saksi => ({
                id: saksi.id,
                name: saksi.name,
                email: saksi.email
            })),
            ballot: ballot,
            totalWhitelists,
            totalVoters
        }

        return res.status(200).json({ data: result })
    } catch (error) {
        console.error('Error fetching finished election:', error)
        return res.status(500).json({ errors: [{ msg: 'Internal server error!!' }] })
    }
})

export default router

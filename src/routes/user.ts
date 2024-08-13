import express, { Request, Response } from 'express'
import { Result, body, param, query, validationResult } from 'express-validator'
import { authenticate } from '../utils/middlewareAuth'
import { Prisma, PrismaClient } from '@prisma/client'
import { PrismaClientKnownRequestError } from '@prisma/client/runtime/library'

const prisma = new PrismaClient()
const router = express.Router()

// Helper function to check if user is admin
const isAdmin = (userData: any) => userData.access === 'ADMIN'

// Helper function to handle validation errors
const handleValidationErrors = (req: Request, res: Response) => {
    const errors = validationResult(req)
    if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() })
    }
}

// Define types for query parameters
interface QueryParams {
    search?: string
    page?: string
    limit?: string
}

// Define types for user data in the request
interface UserData {
    access: string
}

// Define types for grouped users
type AccessLevel = 'USER' | 'CANDIDATE' | 'SAKSI' | 'TERMINATE'

interface GroupMeta {
    currentPage: number
    totalPages: number
    totalItems: number
}

// Define a type for the user data returned by prisma
type PrismaUser = Prisma.UsersGetPayload<{}>

interface GroupData {
    data: PrismaUser[]
    meta: GroupMeta
}

type GroupedUsers = Record<AccessLevel, GroupData>

// GET /users - Get all users grouped by status (excluding ADMIN)

router.get('/', authenticate, async (req: Request<{}, {}, { userData: UserData }, QueryParams>, res: Response) => {
    const userData = req.body.userData

    if (userData.access !== 'ADMIN') {
        return res.status(403).json({ errors: [{ msg: 'Unauthorized access' }] })
    }

    const { search = '', page = '1', limit = '10' } = req.query

    try {
        // Convert page and limit to numbers
        const pageNum = parseInt(page, 10)
        const limitNum = parseInt(limit, 10)

        // Initialize groupedUsers with correct types
        const groupedUsers: GroupedUsers = {
            USER: { data: [], meta: { currentPage: pageNum, totalPages: 0, totalItems: 0 } },
            CANDIDATE: { data: [], meta: { currentPage: pageNum, totalPages: 0, totalItems: 0 } },
            SAKSI: { data: [], meta: { currentPage: pageNum, totalPages: 0, totalItems: 0 } },
            TERMINATE: { data: [], meta: { currentPage: pageNum, totalPages: 0, totalItems: 0 } }
        }

        // Fetch users for each group separately
        for (const access in groupedUsers) {
            let whereClause: any
            if (access === 'TERMINATE') {
                whereClause = { isTerminate: true }
            } else {
                whereClause = {
                    access: access as AccessLevel,
                    isTerminate: false,
                    OR: [
                        {
                            name: {
                                contains: search as string,
                                mode: 'insensitive'
                            }
                        },
                        {
                            email: {
                                contains: search as string,
                                mode: 'insensitive'
                            }
                        }
                    ]
                }
            }

            const users = await prisma.users.findMany({
                where: whereClause,
                include: { profile: true },
                skip: (pageNum - 1) * limitNum,
                take: limitNum
            })

            groupedUsers[access as AccessLevel].data = users

            const totalUsers = await prisma.users.count({ where: whereClause })
            groupedUsers[access as AccessLevel].meta.totalItems = totalUsers
            groupedUsers[access as AccessLevel].meta.totalPages = Math.ceil(totalUsers / limitNum)
        }

        return res.status(200).json(groupedUsers)
    } catch (error) {
        console.error('Error fetching users:', error)
        return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

// CREATE-CANDIDATE - Change user status to candidate
router.put('/create-candidate/:id',
    authenticate,
    param('id').isUUID().withMessage('User ID must be a valid UUID'),
    async (req: Request, res: Response) => {
        const { userData } = req.body
        const { id } = req.params

        if (!isAdmin(userData)) {
            return res.status(403).json({ errors: { msg: 'Unauthorized access' } })
        }

        handleValidationErrors(req, res)

        try {
            const updatedUser = await prisma.users.update({
                where: { id },
                data: { access: 'CANDIDATE' }
            })
            return res.status(200).json({ message: 'User status updated to candidate', data: updatedUser })
        } catch (error) {
            console.error('Error updating user status to candidate:', error)
            if (error instanceof PrismaClientKnownRequestError) {
                return res.status(500).json({ errors: { error, msg: error?.meta?.cause } })
            }
            return res.status(500).json({ errors: { msg: 'Internal server error' } })
        }
    })

// CREATE-SAKSI - Change user status to saksi
router.put('/create-saksi/:id',
    authenticate,
    param('id').isUUID().withMessage('User ID must be a valid UUID'),
    async (req: Request, res: Response) => {
        const { userData } = req.body
        const { id } = req.params

        if (!isAdmin(userData)) {
            return res.status(403).json({ errors: { msg: 'Unauthorized access' } })
        }

        handleValidationErrors(req, res)

        try {
            const updatedUser = await prisma.users.update({
                where: { id },
                data: { access: 'SAKSI' }
            })
            return res.status(200).json({ message: 'User status updated to saksi', data: updatedUser })
        } catch (error) {
            console.error('Error updating user status to saksi:', error)
            if (error instanceof PrismaClientKnownRequestError) {
                return res.status(500).json({ errors: { error, msg: error?.meta?.cause } })
            }
            return res.status(500).json({ errors: { msg: 'Internal server error' } })
        }
    })

// TERMINATE-ACCOUNT - Set user's isTerminate to true
router.put('/terminate-account/:id',
    authenticate,
    param('id').isUUID().withMessage('User ID must be a valid UUID'),
    async (req: Request, res: Response) => {
        const { userData } = req.body
        const { id } = req.params

        if (!isAdmin(userData)) {
            return res.status(403).json({ errors: { msg: 'Unauthorized access' } })
        }

        handleValidationErrors(req, res)

        try {
            const user = await prisma.users.findFirst({
                where: { id }
            })
            if (user?.isTerminate) {
                const updatedUser = await prisma.users.update({
                    where: { id },
                    data: { isTerminate: false }
                })
                return res.status(200).json({ message: 'User account Un-terminated', data: updatedUser })
            }

            const updatedUser = await prisma.users.update({
                where: { id },
                data: { isTerminate: true }
            })
            return res.status(200).json({ message: 'User account terminated', data: updatedUser })

        } catch (error) {
            console.error('Error terminating user account:', error)
            return res.status(500).json({ errors: { msg: 'Internal server error' } })
        }
    })

export default router

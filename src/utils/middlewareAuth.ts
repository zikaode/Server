import { Request, Response, NextFunction } from 'express'
import jwt, { JwtPayload } from 'jsonwebtoken'
import dotenv from 'dotenv'
import { Prisma, PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

dotenv.config()

export async function authenticate(req: Request, res: Response, next: NextFunction) {
    try {
        if (!req.headers.authorization) {
            return res.status(401).json({ errors: [{ msg: 'No Token!' }] })
        }

        const token = req.headers.authorization.split(' ')[1]
        const secretKey = process.env.SECRET_KEY

        if (!secretKey) {
            return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }

        const jwtDecode = jwt.verify(token, secretKey) as JwtPayload

        // Assuming jwtDecode contains the user ID
        const userId = jwtDecode.id
        const user = await prisma.users.findUnique({
            where: { id: userId }
        })

        if (!user) {
            return res.status(401).json({ errors: [{ msg: 'User not found' }] })
        }

        if (!user?.isEmailValidate) {
            return res.status(401).json({ errors: [{ msg: 'Email not verified' }] })
        }

        if (user?.isTerminate) {
            return res.status(403).json({ errors: [{ msg: 'User account is terminated' }] })
        }

        req.body.userData = jwtDecode
        next()
    } catch (error) {
        if (error instanceof jwt.JsonWebTokenError) {
            console.error('Invalid token:', error.message)
            return res.status(401).json({ errors: [{ msg: 'Unauthorized! or Token expired' }] })
        } else if (error instanceof jwt.TokenExpiredError) {
            console.error('Token expired:', error.message)
            return res.status(401).json({ errors: [{ msg: 'Unauthorized! or Token expired!' }] })
        } else {
            console.error('Error during authentication:', error)
            return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
        }
    }
}

export async function Default(req: Request, res: Response, next: NextFunction) {
    try {
        const authHeader = req.headers.authorization
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next() // Call next() when no Bearer token is present
        }
        authenticate(req, res, next)
    } catch (error) {
        return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
}
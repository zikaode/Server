import { Result, body, validationResult } from 'express-validator'
import express, { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import bcrypt, { compare } from 'bcrypt'
import nodemailer from 'nodemailer'
import jwt from 'jsonwebtoken'
import { v4 } from 'uuid'
import { toInt } from 'validator'

const prisma = new PrismaClient()

const router = express.Router()
const secretKey = process.env.SECRET_KEY!
if (!secretKey) throw new Error('SECRET_KEY environment variable is not set')

enum access { USER, CANDIDATE, SAKSI }

const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
})

// Fungsi untuk mengirim email verifikasi - Make later for more good email design!
const sendVerificationEmail = async (email: string, token: string) => {
    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Email Verification</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;background-color:#f4f4f4;margin:0;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:20px 0;text-align:center;background-color:#3498db"></td></tr><tr><td style="padding:40px 30px;background-color:#fff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-bottom:20px;text-align:center"><h1 style="margin:0;color:#333;font-size:24px;font-weight:700">Verify Your Email Address</h1></td></tr><tr><td style="padding-bottom:20px"><p style="margin:0;color:#666;font-size:16px">Thank you for signing up! Please click the button below to verify your email address and activate your account.</p></td></tr><tr><td style="padding-bottom:20px;text-align:center"><a href="${process.env.CLIENT_URL}/verify-email/${token}" style="display:inline-block;padding:12px 24px;background-color:#3498db;color:#fff;text-decoration:none;border-radius:4px;font-size:16px;font-weight:700">Verify Email</a></td></tr><tr><td><p style="margin:0;color:#666;font-size:14px">If you didn't create an account, you can safely ignore this email.</p></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;background-color:#eee"><span class="text-xs text-gray-700 dark:text-gray-400 sm:text-center"> © 2024 Dzikri Arraiyan - Solana e.Voting</span></td></tr></table></body></html>`

    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Email Verification',
        text: `Please verify your email by clicking the following link: ${process.env.CLIENT_URL}/verify-email/${token}`,
        html: htmlContent
    }
    try {
        await transporter.sendMail(mailOptions)
        console.log('Verification email sent')
    } catch (error) {
        console.error('Error sending verify email:', error)
        let errorIdentifier = new Error()
        throw errorIdentifier = { name: 'Email Send Error', message: 'Error - Could not send verify email!' }
    }
}

async function sendResetPasswordEmail(email: string, resetToken: string) {
    const resetUrl = `${process.env.CLIENT_URL}/reset-password/${resetToken}`
    const htmlContent = `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Reset Your Password</title></head><body style="font-family:Arial,sans-serif;line-height:1.6;background-color:#f4f4f4;margin:0;padding:0"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding:20px 0;text-align:center;background-color:#34495e"></td></tr><tr><td style="padding:40px 30px;background-color:#fff"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr><td style="padding-bottom:20px;text-align:center"><h1 style="margin:0;color:#333;font-size:24px;font-weight:700">Reset Your Password</h1></td></tr><tr><td style="padding-bottom:20px"><p style="margin:0;color:#666;font-size:16px">You've requested to reset your password. Click the button below to create a new password:</p></td></tr><tr><td style="padding-bottom:20px;text-align:center"><a href="${resetUrl}" style="display:inline-block;padding:12px 24px;background-color:#e74c3c;color:#fff;text-decoration:none;border-radius:4px;font-size:16px;font-weight:700">Reset Password</a></td></tr><tr><td style="padding-bottom:20px"><p style="margin:0;color:#666;font-size:14px">If you didn't request a password reset, you can safely ignore this email. Your password will remain unchanged.</p></td></tr><tr><td><p style="margin:0;color:#666;font-size:14px">For security reasons, this link will expire in 8 hours. If you need to reset your password after that, please request a new reset link.</p></td></tr></table></td></tr><tr><td style="padding:20px;text-align:center;background-color:#eee"><span class="text-xs text-gray-700 dark:text-gray-400 sm:text-center"> © 2024 Dzikri Arraiyan - Solana e.Voting</span></td></tr></table></body></html>`

    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Reset your password',
        html: htmlContent,
    }

    try {
        await transporter.sendMail(mailOptions)
        console.log('Reset password email sent')
    } catch (error) {
        console.error('Error sending reset password email:', error)
        let errorIdentifier = new Error()
        throw errorIdentifier = { name: 'Email Send Error', message: 'Error - Could not send reset Password email!' }
    }
}

// REGISTER USERS
router.post('/register', [
    body('email').isEmail().normalizeEmail().withMessage('Wrong Email Format').notEmpty().withMessage('Empty Email'),
    body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and be at least 8 characters long'),
    body('name').notEmpty().withMessage('Name is Empty or Invalid!').isLength({ min: 8, max: 32 }).withMessage('Name Must between 8-32 Char!')
], async (req: Request, res: Response) => {
    const { name, email, password } = req.body
    const now = new Date()
    const waktuTunggu = (2 * 60 * 60 * 1000)
    try {
        const user = await prisma.users.findUnique({ where: { email } })
        if (user) {
            if (!user.isEmailValidate) {
                let hourLeftInMiliSecond = (user.createdAt.getTime() + waktuTunggu) - now.getTime()
                let hourLeft = toInt((hourLeftInMiliSecond / 60 / 60 / 1000).toFixed(2))
                let minuteLeft = toInt(((hourLeftInMiliSecond / 60 / 1000) - (hourLeft * 60)).toFixed(2))
                let secondLeft = toInt(((hourLeftInMiliSecond / 1000) - ((hourLeft * 60 * 60) + minuteLeft * 60)).toFixed(2))
                if (hourLeftInMiliSecond > 0) return res.status(400).json({ errors: [{ msg: `Please verify your email before, Or try to re-register using same email 0${hourLeft}:${(minuteLeft < 10) ? ('0' + minuteLeft) : minuteLeft}:${(secondLeft < 10) ? ('0' + secondLeft) : secondLeft} later` }] })
                await prisma.users.delete({ where: { email: user.email } })
            } else if (user.isEmailValidate) return res.status(400).json({ errors: [{ msg: 'User Already Exist!' }] })
        }

        const validation = validationResult(req)
        if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() })

        const hashedPassword = await bcrypt.hash(password, 10)
        const verificationToken = v4()

        await sendVerificationEmail(email, verificationToken)

        const userCreated = await prisma.users.create({
            data: {
                name,
                email,
                access: 'USER',
                password: hashedPassword,
                isEmailValidate: false,
                verificationToken
            }
        })

        res.status(201).json({ message: 'User registered successfully. Please check your email for verification link.', data: userCreated })
    } catch (error: any) {
        console.error('Error registering user:', error)
        res.status(500).json({ errors: [{ msg: (error.message) ? error.message : 'Internal Server Error' }] })
    }
})

// Endpoint Email Verification
router.get('/verify-email/:token', async (req: Request, res: Response) => {
    const token = req.params.token
    setTimeout(async () => {
        try {
            const user = await prisma.users.findUnique({ where: { verificationToken: token } })
            if (!user) return res.status(400).json({ errors: [{ msg: 'Invalid or expired token!' }] })

            await prisma.users.update({
                where: { id: user.id },
                data: { isEmailValidate: true, verificationToken: null }
            })
            res.status(200).json({ message: 'Email verified successfully' })
        } catch (error: any) {
            console.error('Error verifying email:', error)
            res.status(500).json({ errors: [{ msg: (error.message) ? error.message : 'Internal Server Error' }] })
        }
    }, 1800)
})

router.post('/login', [
    body('email').isEmail().normalizeEmail().withMessage('Wrong Email Format').notEmpty().withMessage('Empty Email'),
    body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and be at least 8 characters long')
], async (req: Request, res: Response) => {
    const { email, password } = req.body

    const validation = validationResult(req)
    if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() })

    try {
        const user = await prisma.users.findFirst({ where: { email: email } })
        if (!user) return res.status(400).json({ errors: [{ msg: 'User Not Found!' }] })
        if (!user.isEmailValidate) return res.status(400).json({ errors: [{ msg: 'Please verify your email before login!' }] })
        if (user.isTerminate) return res.status(403).json({ errors: [{ msg: 'Your account has been terminated!' }] })
        const isValidPassword = await bcrypt.compare(password, user.password)

        if (!isValidPassword) return res.status(400).json({ errors: [{ msg: 'Invalid password!' }] })

        const payload = { id: user.id, name: user.name, email: user.email, access: user.access }
        const expired = 60 * 60 * 2
        const token = jwt.sign(payload, secretKey, { expiresIn: expired })

        return res.status(200).json({
            massage: 'Successfully Login!.. Redirected..',
            data: {
                id: user.id,
                email: user.email,
                access: user.access,
                token: token
            }
        })

    } catch (error: any) {
        console.error('Error logging in user:', error)
        res.status(500).json({ errors: [{ msg: (error.message) ? error.message : 'Internal Server Error' }] })
    }
})

router.post('/forgot-password', [
    body('email').isEmail().withMessage('Invalid email address')
], async (req: Request, res: Response) => {
    const { email } = req.body

    const validation = validationResult(req)
    if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() })

    try {
        const user = await prisma.users.findUnique({ where: { email } })
        if (!user) return res.status(404).json({ errors: [{ msg: 'User with this email does not exist' }] })
        if (!user.isEmailValidate) return res.status(400).json({ errors: [{ msg: 'Please verify your email before!' }] })
        if (user.isTerminate) return res.status(403).json({ errors: [{ msg: 'Your account has been terminated!' }] })
        const resetToken = jwt.sign({ id: user.id }, process.env.SECRET_KEY!, { expiresIn: '8h' })
        await sendResetPasswordEmail(email, resetToken)
        return res.status(200).json({ message: 'Reset password email sent' })

    } catch (error: any) {
        console.error('Error during forgot password process:', error)
        res.status(500).json({ errors: [{ msg: (error.message) ? error.message : 'Internal Server Error' }] })
    }
})

router.post('/reset-password', [
    body('password').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
        .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and be at least 8 characters long')
], async (req: Request, res: Response) => {
    const { password } = req.body
    const token = req.query.token as string
    const validation = validationResult(req)

    if (!token) return res.status(400).json({ message: 'Token is required!' })
    if (!validation.isEmpty()) return res.status(400).json({ errors: validation.array() })

    try {
        const decoded = jwt.verify(token, process.env.SECRET_KEY!) as { id: string }

        const hashedPassword = await bcrypt.hash(password, 10)

        const user = await prisma.users.update({
            where: { id: decoded.id },
            data: { password: hashedPassword }
        })
        return res.status(200).json({ message: 'Password reset successfully', data: user })

    } catch (error: any) {
        if (error instanceof jwt.JsonWebTokenError) return res.status(400).json({ errors: [{ msg: 'Invalid or expired token!' }] })
        console.error('Error during password reset process:', error)
        res.status(500).json({ errors: [{ msg: (error.message) ? error.message : 'Internal Server Error' }] })
    }
})

export default router

import express, { Request, Response } from 'express'
import { PrismaClient } from '@prisma/client'
import { Result, body, validationResult } from 'express-validator'
import { authenticate } from '../utils/middlewareAuth'
import { PrismaClientValidationError } from '@prisma/client/runtime/library'
import bcrypt, { compare } from 'bcrypt'

const prisma = new PrismaClient()
const router = express.Router()

enum prodi {
    REKAYASA_MULTIMEDIA,
    TEKNOLOGI_KOMPUTER_JARINGAN,
    TEKNIK_INFORMATIKA,

    AKUTANSI,
    ADMINISTRASI_BISNIS,
    KEUANGAN_SEKTOR_PULIK,
    LEMBAGA_KEUANGAN_SYARIAH,

    LISTRIK,
    TELEKOMUNIKASI,
    ELEKTRONIKA,
    REKAYASA_PEMBANGKIT_LISTRIK,
    REKAYASA_JARINGAN_TELEKOMUNIKASI,
    REKAYASA_INSTRUMEN_DAN_KONTROL,

    TEKNOLOGI_INDUSTRI,
    TEKNOLOGI_MESIN,
    REKAYASA_MANUFAKTURING,
    REKAYASA_PENGELASAN_DAN_FABRIKASI,

    TEKNOLOGI_KIMIA,
    TEKNOLOGI_PENGOLAHAN_MINYAK_DAN_GAS,
    REKAYASA_KIMIA_INDUSTRI,

    KONSTRUKSI_BANGUNAN_AIR,
    KONSTRUKSI_JALAN_JEMBATAN,
    KONSTRUKSI_BANGUNAN_GEDUNG,
    REKAYASA_KONSTRUKSI_JALAN_JEMBATAN
}
enum jurusan {
    SIPIL,
    KIMIA,
    ELEKTRO,
    TATA_NIAGA,
    MESIN,
    TIK
}

// GET ALL PROFILE
router.get('/', authenticate, async (req, res) => {
    const { userData } = req.body
    try {
        const userProfile = await prisma.users.findFirst({
            where: {
                id: userData.id,
            }, select: { id: true, name: true, email: true, access: true, profile: true }
        })
        if (!userProfile?.profile) return res.status(200).json({ massage: "No Profile", data: { ...userProfile, profile: false } })
        return res.status(200).json({ massage: "Success Get All Profile", data: { ...userProfile, profile: { ...userProfile?.profile } } })
    } catch (error) {
        console.error('Error registering user:', error)
        res.status(500).json({ errors: [{ msg: 'Internal Server Error' }] })
    }
})

// UPDATE PROFILE
router.patch('/update', authenticate, async (req, res) => {
    const { userData } = req.body
    try {
        const userProfile = await prisma.users.findFirst({
            where: {
                id: userData.id
            },
            include: { profile: true }
        })
        let createData: { nim: string, prodi: any, jurusan: any, address?: string, image?: string, imageKTM?: string, addressHistory?: string, publickey?: string } = {
            prodi: req.body.prodi,
            jurusan: req.body.jurusan,
            nim: ''
        }
        if (req.body.addressUpdate) {
            if (!userProfile?.profile?.address || !userProfile.profile) {
                return res.status(401).json({ errors: { msg: "Not Have Address History", data: userProfile } })
            } else {
                const Addresshistory = req.body.address + ":" + userProfile.profile.addressHistory
                const ProfileResult = await prisma.profile.update({
                    where: { id: userProfile.profile.id },
                    data: {
                        address: req.body.address,
                        addressHistory: Addresshistory
                    }
                })
                return res.status(201).json({ massage: "Profile Address Successfully Update", data: ProfileResult })
            }
        }
        if (req.body.address && !userProfile?.profile?.address) {
            createData.address = req.body.address, createData.addressHistory = req.body.address
        }
        if (req.body.image) createData.image = req.body.image
        if (req.body.nim) createData.nim = req.body.nim
        if (req.body.imageKTM) createData.imageKTM = req.body.imageKTM
        if (req.body.publicKey) createData.publickey = req.body.publicKey

        if (!userProfile?.profile) {
            const ProfileResult = await prisma.profile.create({
                data: {
                    ...createData,
                    user: {
                        connect: {
                            id: userData.id
                        }
                    }
                }
            })
            return res.status(201).json({ massage: "Profile Successfully to Create", data: ProfileResult })

        } else {
            const ProfileResult = await prisma.profile.update({
                where: { id: userProfile.profile.id },
                data: {
                    ...createData
                }
            })
            return res.status(200).json({ massage: "Profile Successfully to Update", data: ProfileResult })
        }

    } catch (error) {
        if (error instanceof PrismaClientValidationError) {
            return res.status(400).json({ errors: { ...error, msg: "Create/Update Profile Error - Invalid Input!" } })
        }
        res.status(500).json({ errors: { msg: "Internal Server Error" } })
        console.error('Error registering user:', error)

    }
})

// RESET PASSWORD
router.post('/reset-password', authenticate,
    [
        body('oldPassword').notEmpty().withMessage('Old password is required'),
        body('newPassword').matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/)
            .withMessage('Password must contain at least one lowercase letter, one uppercase letter, one number, and be at least 8 characters long'),
        body('confirmNewPassword').custom((value, { req }) => {
            if (value !== req.body.newPassword) {
                throw new Error('Password confirmation does not match password')
            }
            return true
        })
    ],

    async (req: Request, res: Response) => {
        // Cek hasil validasi
        const errors = validationResult(req)
        const { oldPassword, newPassword, userData } = req.body
        console.log(userData)
        if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

        try {
            // Cari - By Nama user berdasarkan ID
            const user = await prisma.users.findUnique({ where: { id: userData.id } })
            if (!user) return res.status(400).json({ errors: [{ msg: 'User Not Found' }] })

            // Cek password lama
            const isMatch = await bcrypt.compare(oldPassword, user.password)
            if (!isMatch) {
                return res.status(400).json({ errors: [{ msg: 'Old password is incorrect' }] })
            }

            // Hash password baru
            const salt = await bcrypt.genSalt(10)
            const hashedPassword = await bcrypt.hash(newPassword, salt)

            // Update password di database
            await prisma.users.update({
                where: { id: userData.id },
                data: { password: hashedPassword }
            })

            res.status(200).json({ message: 'Password reset successful' })
        } catch (error: any) {
            res.status(500).json({ errors: [{ msg: error?.message ? error.message : 'Internal Server Error' }] })
            console.error(error)
        }
    }
)

router.post('/user-init', authenticate, async (req: Request, res: Response) => {
    // Cek hasil validasi
    const errors = validationResult(req)
    const { publicKey, userId, userData } = req.body
    console.log(userData)
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() })

    try {
        // Cari - By Nama user berdasarkan ID
        const user = await prisma.users.findUnique({ where: { id: userId } })
        if (!user) return res.status(400).json({ errors: [{ msg: 'User Not Found' }] })

        const data = await prisma.profile.update({
            where: { userId: userId },
            data: { publicKey }
        })
        return res.status(201).json({ message: "Profile PublicKey Successfully Update", data })

    } catch (error) {

    }
})

export default router

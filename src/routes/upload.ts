// src/routes/imageUploadRoutes.ts
import express, { Request, Response } from 'express'
import parser from '../utils/middlewareUpload'

const router = express.Router()

router.post('/', parser.single('image'), (req: Request, res: Response) => {
    try {
        const image = req.file
        if (!image) {
            return res.status(400).json({ errors: [{ msg: 'No image uploaded' }] })
        }
        return res.status(200).json({ message: 'Image uploaded successfully', imageUrl: image.path })
    } catch (error) {
        console.error('Error uploading image:', error)
        return res.status(500).json({ errors: [{ msg: 'Internal server error' }] })
    }
})

export default router
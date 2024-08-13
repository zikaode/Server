// src/middleware/uploadMiddleware.ts
import multer from 'multer'
import { CloudinaryStorage } from 'multer-storage-cloudinary'
import cloudinary from '../utils/cloudinary'

const storage = new CloudinaryStorage({
    cloudinary: cloudinary,
    params: {
        folder: 'uploads', // Replace this with the appropriate key
        format: async (req, file) => 'jpeg',
        public_id: (req, file) => file.originalname
    } as {
        folder: string
        format: (req: any, file: any) => Promise<string>
        public_id: (req: any, file: any) => string
    }
})

const parser = multer({ storage: storage })

export default parser
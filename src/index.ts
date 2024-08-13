import express from 'express'
import authRouter from './routes/auth'
import profileRouter from './routes/profile'
import electionRouter from './routes/election'
import userRouter from './routes/user'
import whitelistRouter from './routes/whitelist'
import ballotRouter from './routes/ballot'
import resultRouter from './routes/result'
import uploadRouter from './routes/upload'
import dotenv from 'dotenv'
import cors from 'cors'

dotenv.config()


const app = express()
const PORT = 3000
app.use(cors()) // Enable CORS for all routes
app.use(express.json())
app.use('/auth', authRouter)
app.use('/profile', profileRouter)
app.use('/election', electionRouter)
app.use('/user', userRouter)
app.use('/result', resultRouter)
app.use('/ballot', ballotRouter)
app.use('/upload', uploadRouter)
app.use('/whitelist', whitelistRouter)
app.get('/', (req, res) => {
    res.status(200).json({ massage: "Welcome", data: req.body.userData })
})

app.listen(PORT, () => {
    console.log(`Server Running On Port: ${PORT}`)
})
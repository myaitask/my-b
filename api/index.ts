import { Hono } from 'hono'
import { handle } from 'hono/vercel'
import { cors } from 'hono/cors'
import { serve } from 'inngest/hono'
import { inngest } from './inngest/client'
import { processWhatsAppMessage } from './inngest/functions'

export const config = {
  runtime: 'edge',
}

const app = new Hono()

app.use('*', cors({
  origin: 'https://automate.myaitask.com',
  allowHeaders: ['Content-Type', 'Authorization'],
  allowMethods: ['POST', 'GET', 'OPTIONS'],
  exposeHeaders: ['Content-Length'],
  maxAge: 600,
  credentials: true,
}))

app.get('/', (c) => {
  return c.json({ message: 'Hello from Hono on Vercel!' })
})

// Webhook receiver
app.get('/webhooks/whatsapp', (c) => {
  const mode = c.req.query('hub.mode')
  const token = c.req.query('hub.verify_token')
  const challenge = c.req.query('hub.challenge')

  if (mode === 'subscribe' && token === process.env.META_VERIFY_TOKEN) {
    console.log('Webhook verified successfully!')
    return c.text(challenge || 'ok')
  } else {
    return c.text('Forbidden', 403)
  }
})

app.post('/webhooks/whatsapp', async (c) => {
  const body = await c.req.json()
  
  // Fire Inngest event in the background
  await inngest.send({
    name: 'whatsapp/message.received',
    data: { payload: body }
  })

  // Instantly return 200 OK to Meta
  return c.json({ status: 'received' })
})

// Inngest executor endpoint
app.on(
  ['GET', 'POST', 'PUT'],
  '/inngest',
  serve({ client: inngest, functions: [processWhatsAppMessage] })
)

export default handle(app)
export { app }

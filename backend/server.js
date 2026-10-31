import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { connectDB } from './config/db.js';
import { notFound, errorHandler } from './middleware/error.js';
import authRoutes from './routes/authRoutes.js';
import userRoutes from './routes/userRoutes.js';
import taxRoutes from './routes/taxRoutes.js';
import productRoutes from './routes/productRoutes.js';
import planRoutes from './routes/planRoutes.js';
import quotationTemplateRoutes from './routes/quotationTemplateRoutes.js';
import subscriptionRoutes from './routes/subscriptionRoutes.js';
import discountRoutes from './routes/discountRoutes.js';
import invoiceRoutes from './routes/invoiceRoutes.js';
import billingRoutes from './routes/billingRoutes.js';
import { startBillingJob } from './jobs/billingJob.js';

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set in .env');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1); // needed behind Render's proxy

app.use(helmet());
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173', credentials: true }));
app.use(express.json());

app.use((req, res, next) => {
  req.body ??= {};
  next();
});

app.use(morgan('dev'));

app.get('/api/health', (req, res) => {
  res.json({
    success: true,
    message: 'Subscription Management API is running',
    time: new Date().toISOString(),
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/taxes', taxRoutes);
app.use('/api/products', productRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/quotation-templates', quotationTemplateRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/discounts', discountRoutes);
app.use('/api/invoices', invoiceRoutes);
app.use('/api/billing', billingRoutes);

app.use(notFound);
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

connectDB()
  .then(() => {
    app.listen(PORT, () => console.log(`API listening on port ${PORT}`));
    if (process.env.ENABLE_BILLING_JOB !== 'false') startBillingJob();
  })
  .catch((err) => {
    console.error('Startup failed:', err.message);
    process.exit(1);
  });

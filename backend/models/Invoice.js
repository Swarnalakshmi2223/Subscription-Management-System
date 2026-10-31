import mongoose from 'mongoose';

const invoiceLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    description: {
      type: String,
      required: true,
      trim: true,
    },
    quantity: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Quantity must be a whole number',
      },
    },
    unitPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Unit price must be an integer in paise',
      },
    },
    discountAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Discount amount must be an integer in paise',
      },
    },
    taxRatePercent: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Tax amount must be an integer in paise',
      },
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Amount must be an integer in paise',
      },
    },
  },
  { _id: false }
);

const invoiceSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    subscriptionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subscription',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    billingPeriodKey: {
      type: String,
      required: true,
      trim: true,
    },
    periodStart: {
      type: Date,
      required: true,
    },
    periodEnd: {
      type: Date,
      required: true,
    },
    issueDate: {
      type: Date,
      required: true,
    },
    dueDate: {
      type: Date,
      required: true,
    },
    status: {
      type: String,
      enum: ['Draft', 'Confirmed', 'Paid', 'Cancelled'],
      default: 'Draft',
    },
    lines: {
      type: [invoiceLineSchema],
      required: true,
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'An invoice must contain at least one line',
      },
    },
    subtotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Subtotal must be an integer in paise',
      },
    },
    discountTotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Discount total must be an integer in paise',
      },
    },
    taxTotal: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Tax total must be an integer in paise',
      },
    },
    total: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Total must be an integer in paise',
      },
    },
    amountPaid: {
      type: Number,
      default: 0,
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Amount paid must be an integer in paise',
      },
    },
    appliedDiscountIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Discount',
      },
    ],
    sentAt: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

invoiceSchema.index(
  { subscriptionId: 1, billingPeriodKey: 1 },
  { unique: true }
);
invoiceSchema.index({ customerId: 1, status: 1 });
invoiceSchema.index({ status: 1, dueDate: 1 });
invoiceSchema.index({ issueDate: 1 });

invoiceSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Invoice', invoiceSchema);

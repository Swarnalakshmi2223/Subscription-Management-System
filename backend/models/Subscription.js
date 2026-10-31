
import mongoose from 'mongoose';

const subscriptionLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    variant: {
      attribute: { type: String, trim: true },
      value: { type: String, trim: true },
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
    },
    taxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tax',
      default: null,
    },
    taxAmount: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },

    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: true,
    },

    templateId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'QuotationTemplate',
      default: null,
    },

    status: {
      type: String,
      enum: ['Draft', 'Quotation', 'Confirmed', 'Active', 'Closed'],
      default: 'Draft',
    },

    startDate: {
      type: Date,
      required: true,
    },

    expiryDate: {
      type: Date,
      required: true,
    },

    paymentTerms: {
      type: String,
      enum: ['immediate', 'net15', 'net30'],
      default: 'immediate',
    },

    lines: {
      type: [subscriptionLineSchema],
      required: true,
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'A subscription must contain at least one product',
      },
    },

    discountIds: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Discount',
    }],

    quotationValidUntil: {
      type: Date,
      default: null,
    },

    nextBillingDate: {
      type: Date,
      default: null,
    },

    isPaused: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

subscriptionSchema.index({ status: 1, nextBillingDate: 1 });
subscriptionSchema.index({ customerId: 1, status: 1 });
subscriptionSchema.index({ planId: 1 });

subscriptionSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Subscription', subscriptionSchema);

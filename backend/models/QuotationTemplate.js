
import mongoose from 'mongoose';

const templateLineSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    variant: {
      attribute: {
        type: String,
        trim: true,
      },
      value: {
        type: String,
        trim: true,
      },
    },
    quantity: {
      type: Number,
      required: [true, 'Quantity is required'],
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Quantity must be a whole number',
      },
    },
  },
  { _id: false }
);

const quotationTemplateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Template name is required'],
      trim: true,
      maxlength: 150,
    },
    validityDays: {
      type: Number,
      required: [true, 'Quotation validity is required'],
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Validity days must be a whole number',
      },
    },
    planId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Plan',
      required: [true, 'Subscription plan is required'],
    },
    lines: {
      type: [templateLineSchema],
      default: [],
      validate: {
        validator: (lines) => lines.length > 0,
        message: 'A quotation template must contain at least one product',
      },
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

quotationTemplateSchema.index({ isActive: 1, createdAt: -1 });
quotationTemplateSchema.index({ planId: 1 });

quotationTemplateSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model(
  'QuotationTemplate',
  quotationTemplateSchema
);

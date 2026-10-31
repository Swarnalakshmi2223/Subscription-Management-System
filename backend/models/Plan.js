
import mongoose from 'mongoose';

const planSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Plan name is required'],
      trim: true,
      maxlength: 150,
    },
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: [true, 'Product is required'],
    },
    price: {
      type: Number,
      required: [true, 'Plan price is required'],
      min: 0,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Plan price must be an integer in paise',
      },
    },
    billingPeriod: {
      type: String,
      enum: ['daily', 'weekly', 'monthly', 'yearly'],
      required: [true, 'Billing period is required'],
    },
    minQuantity: {
      type: Number,
      default: 1,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Minimum quantity must be a whole number',
      },
    },
    startDate: {
      type: Date,
      required: [true, 'Plan start date is required'],
    },
    endDate: {
      type: Date,
      required: [true, 'Plan end date is required'],
      validate: {
        validator: function (value) {
          return !this.startDate || value >= this.startDate;
        },
        message: 'Plan end date must be on or after start date',
      },
    },
    autoClose: {
      type: Boolean,
      default: true,
    },
    allowEarlyClose: {
      type: Boolean,
      default: false,
    },
    allowPause: {
      type: Boolean,
      default: false,
    },
    allowRenew: {
      type: Boolean,
      default: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

planSchema.index({ productId: 1 });
planSchema.index({ isActive: 1, startDate: 1, endDate: 1 });

planSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Plan', planSchema);

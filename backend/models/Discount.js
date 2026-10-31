import mongoose from 'mongoose';

const discountSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Discount name is required'],
      trim: true,
      maxlength: [100, 'Discount name cannot exceed 100 characters'],
    },

    type: {
      type: String,
      enum: ['fixed', 'percentage'],
      required: [true, 'Discount type is required'],
    },

    // Fixed discount: paise
    // Percentage discount: percentage value
    value: {
      type: Number,
      required: [true, 'Discount value is required'],
      min: [0.01, 'Discount value must be greater than zero'],
    },

    // Stored in paise
    minPurchase: {
      type: Number,
      default: 0,
      min: [0, 'Minimum purchase cannot be negative'],
    },

    minQuantity: {
      type: Number,
      default: 1,
      min: [1, 'Minimum quantity must be at least 1'],
      validate: {
        validator: Number.isInteger,
        message: 'Minimum quantity must be a whole number',
      },
    },

    startDate: {
      type: Date,
      required: [true, 'Discount start date is required'],
    },

    endDate: {
      type: Date,
      required: [true, 'Discount end date is required'],
    },

    usageLimit: {
      type: Number,
      default: null,
      min: [1, 'Usage limit must be at least 1'],
      validate: {
        validator: function (value) {
          return value === null || Number.isInteger(value);
        },
        message: 'Usage limit must be a whole number',
      },
    },

    usageCount: {
      type: Number,
      default: 0,
      min: 0,
    },

    appliesTo: {
      type: String,
      enum: ['products', 'subscriptions'],
      required: [true, 'Discount target is required'],
    },

    productIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Product',
      },
    ],

    subscriptionIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Subscription',
      },
    ],

    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Validate percentage discounts and date ranges.
discountSchema.pre('validate', function () {
  if (this.endDate && this.startDate && this.endDate < this.startDate) {
    this.invalidate('endDate', 'End date must be on or after start date');
  }

  if (this.type === 'percentage' && this.value > 100) {
    this.invalidate('value', 'Percentage discount cannot exceed 100');
  }

  if (this.appliesTo === 'products' && this.subscriptionIds.length > 0) {
    this.invalidate(
      'subscriptionIds',
      'Product discounts cannot target subscriptions'
    );
  }

  if (this.appliesTo === 'subscriptions' && this.productIds.length > 0) {
    this.invalidate(
      'productIds',
      'Subscription discounts cannot target products'
    );
  }
});

// Indexes for discount filtering.
discountSchema.index({ isActive: 1, startDate: 1, endDate: 1 });
discountSchema.index({ appliesTo: 1, isActive: 1 });
discountSchema.index({ name: 1 });

const Discount = mongoose.model('Discount', discountSchema);

export default Discount;

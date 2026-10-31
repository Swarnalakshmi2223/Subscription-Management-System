
import mongoose from 'mongoose';

const variantSchema = new mongoose.Schema(
  {
    attribute: {
      type: String,
      required: true,
      trim: true,
    },
    value: {
      type: String,
      required: true,
      trim: true,
    },
    extraPrice: {
      type: Number,
      required: true,
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Variant extra price must be an integer in paise',
      },
    },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: 150,
    },
    type: {
      type: String,
      required: [true, 'Product type is required'],
      trim: true,
    },
    salesPrice: {
      type: Number,
      required: [true, 'Sales price is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Sales price must be an integer in paise',
      },
    },
    costPrice: {
      type: Number,
      required: [true, 'Cost price is required'],
      min: 0,
      validate: {
        validator: Number.isInteger,
        message: 'Cost price must be an integer in paise',
      },
    },
    notes: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
    taxId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Tax',
      default: null,
    },
    variants: {
      type: [variantSchema],
      default: [],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

productSchema.index({ name: 1 });
productSchema.index({ isActive: 1, createdAt: -1 });

productSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Product', productSchema);

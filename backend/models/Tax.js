
import mongoose from 'mongoose';

const taxSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Tax name is required'],
      trim: true,
      maxlength: 100,
      unique: true,
    },
    ratePercent: {
      type: Number,
      required: [true, 'Tax percentage is required'],
      min: [0, 'Tax percentage cannot be negative'],
      max: [100, 'Tax percentage cannot exceed 100'],
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

taxSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Tax', taxSchema);

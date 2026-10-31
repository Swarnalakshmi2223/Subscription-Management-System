import mongoose from 'mongoose';

const paymentSchema = new mongoose.Schema(
  {
    invoiceId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Invoice',
      required: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    recordedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    method: {
      type: String,
      enum: ['cash', 'bank_transfer', 'card', 'upi', 'cheque'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 1,
      validate: {
        validator: Number.isSafeInteger,
        message: 'Payment amount must be a positive integer in paise',
      },
    },
    paymentDate: {
      type: Date,
      required: true,
    },
    note: {
      type: String,
      trim: true,
      maxlength: 1000,
    },
  },
  { timestamps: true }
);

paymentSchema.index({ invoiceId: 1 });
paymentSchema.index({ paymentDate: 1 });
paymentSchema.index({ method: 1, paymentDate: 1 });
paymentSchema.index({ customerId: 1, paymentDate: 1 });
paymentSchema.index({ paymentDate: -1, createdAt: -1 });

paymentSchema.set('toJSON', {
  transform: (doc, ret) => {
    delete ret.__v;
    return ret;
  },
});

export default mongoose.model('Payment', paymentSchema);

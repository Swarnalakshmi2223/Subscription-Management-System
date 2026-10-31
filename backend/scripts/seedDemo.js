import 'dotenv/config';
import mongoose from 'mongoose';

import { connectDB } from '../config/db.js';
import Discount from '../models/Discount.js';
import Invoice from '../models/Invoice.js';
import Payment from '../models/Payment.js';
import Plan from '../models/Plan.js';
import Product from '../models/Product.js';
import QuotationTemplate from '../models/QuotationTemplate.js';
import Subscription from '../models/Subscription.js';
import Tax from '../models/Tax.js';
import User from '../models/User.js';
import { addPeriod, startOfDayIST } from '../utils/dates.js';

const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'Demo_User_2026!';
const DEMO_DOMAIN = 'demo.brightloop.local';
const demoDate = (value) => startOfDayIST(value);

const upsert = (Model, filter, update) => Model.findOneAndUpdate(
  filter,
  { $set: update },
  { upsert: true, returnDocument: 'after', runValidators: true, setDefaultsOnInsert: true }
);

const makeLine = ({ product, tax, quantity = 1, unitPrice = product.salesPrice, variant }) => ({
  productId: product._id,
  variant,
  quantity,
  description: variant?.value ? `${product.name} (${variant.value})` : product.name,
  unitPrice,
  taxId: tax?._id || null,
  taxAmount: 0,
  taxRatePercent: tax?.ratePercent || 0,
  amount: unitPrice * quantity,
});

const makeInvoiceLine = (line, discountAmount = 0) => {
  const discountedSubtotal = Math.max(line.unitPrice * line.quantity - discountAmount, 0);
  const taxAmount = Math.round((discountedSubtotal * line.taxRatePercent) / 100);
  return {
    productId: line.productId,
    description: line.description,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    discountAmount,
    taxRatePercent: line.taxRatePercent,
    taxAmount,
    amount: discountedSubtotal + taxAmount,
  };
};

const seedUsers = async () => {
  const passwordHash = await User.hashPassword(DEMO_PASSWORD);
  const admin = await upsert(User, { email: `admin@${DEMO_DOMAIN}` }, {
    name: 'Brightloop Demo Admin',
    email: `admin@${DEMO_DOMAIN}`,
    passwordHash,
    role: 'admin',
    isActive: true,
  });
  const staff = await upsert(User, { email: `staff@${DEMO_DOMAIN}` }, {
    name: 'Brightloop Demo Staff',
    email: `staff@${DEMO_DOMAIN}`,
    passwordHash,
    role: 'staff',
    isActive: true,
  });
  const customers = [];
  for (let index = 1; index <= 10; index += 1) {
    customers.push(await upsert(User, { email: `customer${index}@${DEMO_DOMAIN}` }, {
      name: `Demo Customer ${index}`,
      email: `customer${index}@${DEMO_DOMAIN}`,
      passwordHash,
      role: 'customer',
      company: `Demo Company ${index}`,
      phone: `90000000${String(index).padStart(2, '0')}`,
      isActive: true,
    }));
  }
  return { admin, staff, customers };
};

const seedCatalog = async () => {
  const taxes = {};
  for (const rate of [5, 12, 18]) {
    taxes[rate] = await upsert(Tax, { name: `GST ${rate}%` }, {
      name: `GST ${rate}%`,
      ratePercent: rate,
      isActive: true,
    });
  }

  const products = {};
  products.cloud = await upsert(Product, { name: 'Demo Cloud Suite' }, {
    name: 'Demo Cloud Suite',
    type: 'Software',
    salesPrice: 120000,
    costPrice: 45000,
    notes: 'Demo subscription product with regional variants.',
    taxId: taxes[18]._id,
    variants: [
      { attribute: 'Brand', value: 'Standard', extraPrice: 0 },
      { attribute: 'Brand', value: 'Odoo', extraPrice: 56000 },
    ],
    isActive: true,
  });
  products.support = await upsert(Product, { name: 'Demo Support Desk' }, {
    name: 'Demo Support Desk',
    type: 'Service',
    salesPrice: 80000,
    costPrice: 20000,
    notes: 'Demo support add-on.',
    taxId: taxes[12]._id,
    variants: [{ attribute: 'Tier', value: 'Priority', extraPrice: 15000 }],
    isActive: true,
  });
  products.analytics = await upsert(Product, { name: 'Demo Analytics Pack' }, {
    name: 'Demo Analytics Pack',
    type: 'Software',
    salesPrice: 95000,
    costPrice: 30000,
    notes: 'Demo reporting add-on.',
    taxId: taxes[5]._id,
    variants: [],
    isActive: true,
  });

  const planFlags = [
    ['Demo Daily Flex', 'daily', { autoClose: false, allowEarlyClose: true, allowPause: true, allowRenew: true }],
    ['Demo Weekly Standard', 'weekly', { autoClose: true, allowEarlyClose: false, allowPause: false, allowRenew: true }],
    ['Demo Monthly Team', 'monthly', { autoClose: true, allowEarlyClose: true, allowPause: true, allowRenew: false }],
    ['Demo Yearly Enterprise', 'yearly', { autoClose: true, allowEarlyClose: false, allowPause: true, allowRenew: true }],
  ];
  const plans = {};
  for (const [name, billingPeriod, flags] of planFlags) {
    plans[billingPeriod] = await upsert(Plan, { name }, {
      name,
      productId: products.cloud._id,
      price: billingPeriod === 'yearly' ? 1200000 : billingPeriod === 'monthly' ? 120000 : billingPeriod === 'weekly' ? 35000 : 6000,
      billingPeriod,
      minQuantity: billingPeriod === 'yearly' ? 5 : 1,
      startDate: demoDate('2025-01-01'),
      endDate: demoDate('2027-12-31'),
      ...flags,
      isActive: true,
    });
  }

  const templates = {
    starter: await upsert(QuotationTemplate, { name: 'Demo Starter Template' }, {
      name: 'Demo Starter Template',
      validityDays: 30,
      planId: plans.monthly._id,
      lines: [{ productId: products.cloud._id, quantity: 1, variant: { attribute: 'Brand', value: 'Standard' } }],
      isActive: true,
    }),
    enterprise: await upsert(QuotationTemplate, { name: 'Demo Enterprise Template' }, {
      name: 'Demo Enterprise Template',
      validityDays: 45,
      planId: plans.yearly._id,
      lines: [
        { productId: products.cloud._id, quantity: 5, variant: { attribute: 'Brand', value: 'Odoo' } },
        { productId: products.analytics._id, quantity: 5 },
      ],
      isActive: true,
    }),
  };

  return { taxes, products, plans, templates };
};

const seedSubscriptions = async ({ customers, products, taxes, plans, templates }) => {
  const definitions = [
    ['Draft', plans.monthly, templates.starter, 'immediate'],
    ['Quotation', plans.weekly, templates.starter, 'net15'],
    ['Confirmed', plans.daily, templates.starter, 'net30'],
    ['Active', plans.monthly, templates.starter, 'immediate'],
    ['Closed', plans.yearly, templates.enterprise, 'net30'],
  ];
  const subscriptions = {};
  for (let index = 0; index < definitions.length; index += 1) {
    const [status, plan, template, paymentTerms] = definitions[index];
    const startDate = demoDate(`2026-0${index + 1}-01`);
    const line = makeLine({
      product: products.cloud,
      tax: taxes[18],
      quantity: plan.billingPeriod === 'yearly' ? 5 : 1,
      unitPrice: plan.price,
      variant: index === 4 ? { attribute: 'Brand', value: 'Odoo' } : { attribute: 'Brand', value: 'Standard' },
    });
    if (index === 4) line.unitPrice += 56000;
    line.amount = line.unitPrice * line.quantity;
    const number = `DEMO-SUB-${status.toUpperCase()}`;
    subscriptions[status] = await upsert(Subscription, { number }, {
      number,
      customerId: customers[index]._id,
      planId: plan._id,
      templateId: template._id,
      status,
      startDate,
      expiryDate: demoDate('2027-12-31'),
      paymentTerms,
      lines: [line, makeLine({ product: products.support, tax: taxes[12], quantity: 1, unitPrice: products.support.salesPrice })],
      quotationValidUntil: status === 'Quotation' ? demoDate('2026-12-31') : null,
      nextBillingDate: status === 'Active' ? demoDate('2026-11-01') : null,
      periodsBilled: 0,
      isPaused: false,
    });
  }
  return subscriptions;
};

const seedDiscounts = async ({ products, subscriptions }) => {
  const startDate = demoDate('2026-01-01');
  const endDate = demoDate('2027-12-31');
  const productDiscount = await upsert(Discount, { name: 'Demo Odoo Launch Discount' }, {
    name: 'Demo Odoo Launch Discount',
    type: 'fixed',
    value: 10000,
    minPurchase: 0,
    minQuantity: 1,
    startDate,
    endDate,
    usageLimit: 100,
    usageCount: 0,
    appliesTo: 'products',
    productIds: [products.cloud._id],
    subscriptionIds: [],
    isActive: true,
  });
  const percentageDiscount = await upsert(Discount, { name: 'Demo Annual Percentage Discount' }, {
    name: 'Demo Annual Percentage Discount',
    type: 'percentage',
    value: 15,
    minPurchase: 100000,
    minQuantity: 1,
    startDate,
    endDate,
    usageLimit: null,
    usageCount: 0,
    appliesTo: 'subscriptions',
    productIds: [],
    subscriptionIds: [subscriptions.Active._id, subscriptions.Confirmed._id],
    isActive: true,
  });
  return { productDiscount, percentageDiscount };
};

const seedInvoices = async ({ subscriptions, products, taxes, customers, admin }) => {
  await Payment.deleteMany({ note: /^Demo payment/ });
  const line = (subscription, product = products.cloud) => subscription.lines.find((item) => String(item.productId) === String(product._id)) || subscription.lines[0];
  const definitions = [
    { key: 'draft', subscription: subscriptions.Draft, status: 'Draft', issueDate: '2026-10-01', dueDate: '2026-11-01', discount: 0 },
    { key: 'confirmed', subscription: subscriptions.Confirmed, status: 'Confirmed', issueDate: '2026-10-01', dueDate: '2026-10-15', discount: 10000 },
    { key: 'paid', subscription: subscriptions.Active, status: 'Paid', issueDate: '2026-09-01', dueDate: '2026-09-15', discount: 5000 },
    { key: 'overdue', subscription: subscriptions.Closed, status: 'Confirmed', issueDate: '2026-08-01', dueDate: '2026-09-01', discount: 0 },
  ];
  const invoices = {};
  for (const definition of definitions) {
    const sourceLine = line(definition.subscription);
    const invoiceLine = makeInvoiceLine(sourceLine, definition.discount);
    const subtotal = sourceLine.unitPrice * sourceLine.quantity;
    const taxTotal = invoiceLine.taxAmount;
    const total = invoiceLine.amount;
    const amountPaid = definition.status === 'Paid' ? total : definition.key === 'overdue' ? 25000 : 0;
    invoices[definition.key] = await upsert(Invoice, {
      subscriptionId: definition.subscription._id,
      billingPeriodKey: `2026-${definition.key}`,
    }, {
      number: `DEMO-INV-${definition.key.toUpperCase()}`,
      subscriptionId: definition.subscription._id,
      customerId: definition.subscription.customerId,
      billingPeriodKey: `2026-${definition.key}`,
      periodStart: demoDate(definition.issueDate),
      periodEnd: new Date(addPeriod(demoDate(definition.issueDate), 'monthly').getTime() - 1),
      issueDate: demoDate(definition.issueDate),
      dueDate: demoDate(definition.dueDate),
      status: definition.status,
      lines: [invoiceLine],
      subtotal,
      discountTotal: definition.discount,
      taxTotal,
      total,
      amountPaid,
      appliedDiscountIds: [],
      sentAt: null,
    });
  }

  await Payment.create([
    {
      invoiceId: invoices.paid._id,
      customerId: customers[3]._id,
      recordedBy: admin._id,
      method: 'upi',
      amount: invoices.paid.total,
      paymentDate: demoDate('2026-09-10'),
      note: 'Demo payment - paid invoice',
    },
    {
      invoiceId: invoices.overdue._id,
      customerId: customers[4]._id,
      recordedBy: admin._id,
      method: 'bank_transfer',
      amount: 25000,
      paymentDate: demoDate('2026-08-15'),
      note: 'Demo payment - partial overdue invoice',
    },
  ]);
  return invoices;
};

async function run() {
  await connectDB();
  const users = await seedUsers();
  const catalog = await seedCatalog();
  const subscriptions = await seedSubscriptions({ ...users, ...catalog });
  await seedDiscounts({ ...catalog, subscriptions });
  const invoices = await seedInvoices({ ...users, ...catalog, subscriptions });

  console.log(JSON.stringify({
    seeded: true,
    demoDomain: DEMO_DOMAIN,
    staff: 1,
    customers: users.customers.length,
    taxes: Object.keys(catalog.taxes).length,
    products: Object.keys(catalog.products).length,
    plans: Object.keys(catalog.plans).length,
    templates: Object.keys(catalog.templates).length,
    subscriptions: Object.keys(subscriptions).length,
    invoices: Object.keys(invoices).length,
    passwordConfigured: Boolean(process.env.DEMO_PASSWORD),
  }, null, 2));
}

run()
  .catch((error) => {
    console.error('Demo seed failed:', error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });

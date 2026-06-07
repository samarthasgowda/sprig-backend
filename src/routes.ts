import { Router } from 'express';
import authRoutes from './modules/auth/auth.routes';
import productRoutes from './modules/products/products.routes';
import cartRoutes from './modules/cart/cart.routes';
import orderRoutes from './modules/orders/orders.routes';
import paymentRoutes from './modules/payments/payments.routes';

const router = Router();
router.use('/auth', authRoutes);
router.use('/products', productRoutes);
router.use('/cart', cartRoutes);
router.use('/orders', orderRoutes);
router.use('/payments', paymentRoutes);
export default router;

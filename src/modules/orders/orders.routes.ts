import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { createOrderSchema, updateStatusSchema, listOrdersSchema } from './orders.schema';
import * as c from './orders.controller';

const router = Router();
router.use(authenticate);

router.post('/', authorize('CUSTOMER'), validate(createOrderSchema), c.createCtrl);
router.get('/', validate(listOrdersSchema, 'query'), c.listCtrl);
router.get('/:id', c.getCtrl);
router.patch(
  '/:id/status',
  authorize('STORE_OWNER', 'DELIVERY_PARTNER', 'ADMIN', 'SUPPORT'),
  validate(updateStatusSchema),
  c.updateStatusCtrl,
);

export default router;

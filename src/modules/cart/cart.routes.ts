import { Router } from 'express';
import { authenticate } from '../../middleware/auth';
import { authorize } from '../../middleware/rbac';
import { validate } from '../../middleware/validate';
import { addItemSchema, updateItemSchema } from './cart.schema';
import * as c from './cart.controller';

const router = Router();
router.use(authenticate, authorize('CUSTOMER'));

router.get('/', c.getCtrl);
router.post('/items', validate(addItemSchema), c.addCtrl);
router.patch('/items/:id', validate(updateItemSchema), c.updateCtrl);
router.delete('/items/:id', c.removeCtrl);
router.delete('/', c.clearCtrl);

export default router;

import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as svc from './cart.service';

export const getCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.getCart(req.user!.id));
});
export const addCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await svc.addItem(req.user!.id, req.body));
});
export const updateCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.updateItem(req.user!.id, req.params.id, req.body.quantity));
});
export const removeCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.removeItem(req.user!.id, req.params.id));
});
export const clearCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.clearCart(req.user!.id));
});

import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as svc from './orders.service';

export const createCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.status(201).json(await svc.createFromCart(req.user!.id, req.body));
});
export const listCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.listOrders(req.user!, req.query as never));
});
export const getCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.getOrder(req.params.id, req.user!));
});
export const updateStatusCtrl = asyncHandler(async (req: Request, res: Response) => {
  res.json(await svc.updateStatus(req.params.id, req.user!, req.body));
});

import { ToiletFacility } from '../types';

export const findSelectedToilet = (
  toilets: ToiletFacility[],
  selectedToiletId: string | null
) => toilets.find((toilet) => toilet.id === selectedToiletId) ?? null;

export const isViewportAlreadyAt = (
  current: { lat: number; lng: number; zoom: number },
  target: { lat: number; lng: number; zoom: number }
) =>
  Math.abs(current.lat - target.lat) < 0.000001 &&
  Math.abs(current.lng - target.lng) < 0.000001 &&
  Math.abs(current.zoom - target.zoom) < 0.01;

export const reviewHttpOutcome = (status: number) =>
  status >= 200 && status < 300 ? 'accepted' : 'rejected';

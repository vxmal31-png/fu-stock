import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Check your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

export type Product = {
  id: string;
  product_code: string;
  name: string;
  category: 'tool' | 'spare_part';
  brand: string;
  description: string;
  quantity: number;
  price: number;
  min_stock: number;
  location: string;
  qr_token: string;
  created_at: string;
  updated_at: string;
};

export type Transaction = {
  id: string;
  product_id: string;
  mechanic_id: string | null;
  mechanic_name: string | null;
  action_type: 'checkout' | 'return' | 'deduction' | 'addition' | 'adjustment';
  quantity_change: number;
  remaining_quantity: number;
  previous_stock: number;
  notes: string;
  created_at: string;
  product?: Product;
};

export type DeductResult = {
  success: boolean;
  message: string;
  product_id: string | null;
  product_name: string | null;
  remaining: number | null;
  action_performed: string | null;
};

export type ReturnResult = {
  success: boolean;
  message: string;
  product_id: string | null;
  product_name: string | null;
  remaining: number | null;
};

export type AdjustStockResult = {
  success: boolean;
  message: string;
  product_id: string | null;
  product_name: string | null;
  previous_stock: number | null;
  new_stock: number | null;
};

export type BulkConfirmItem = {
  product_id: string;
  product_name: string;
  category: 'tool' | 'spare_part';
  action: 'checkout' | 'deduction' | 'return';
  quantity: number;
  previous_stock: number;
  new_stock: number;
};

export type BulkConfirmResult = {
  success: boolean;
  replayed: boolean;
  items: BulkConfirmItem[];
};

const SESSION_KEY = 'workshop_session_id';

export function getSessionId(): string {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

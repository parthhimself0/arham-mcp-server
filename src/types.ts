export interface Product {
  id: string;
  tagId?: string;
  tagNo?: string;
  name: string;
  nameSlug?: string;
  imageUrl?: string;
  karat?: string;
  isActive: boolean;
  rawData?: Record<string, unknown>;
  category?: Category;
  createdAt?: string;
  updatedAt?: string;
}

export interface ProductDetails extends Product {
  touch?: string;
  grossWeight?: number;
  fineWeight?: number;
  itemName?: string;
  designName?: string;
  groupName?: string;
  subItemName?: string;
  barcode?: string;
  size?: string;
  metalType?: string;
  genderName?: string;
  designCode?: string;
  stockImage?: string;
  voucherNo?: string;
  hsnCode?: string;
  wastagePercent?: number;
  salesWastagePercent?: number;
  salesTouch?: number;
}

export interface Category {
  id: string;
  name: string;
  nameSlug: string;
  description?: string;
  imageUrl: string;
  parentId?: string;
  parent?: Category;
  children?: Category[];
  level?: number;
  images?: unknown;
}

export interface GoldRate {
  id: string;
  ratePerGram: number;
  setBy?: string;
  createdAt: string;
}

export interface UserOrder {
  id: string;
  orderToken?: number;
  status: string;
  adminMessage?: string;
  totalAmount?: number;
  createdAt: string;
  updatedAt: string;
  items: OrderItem[];
}

export interface OrderItem {
  id: string;
  quantity: number;
  price: number;
  isRejected: boolean;
  stockNote?: string;
  product: OrderProduct;
}

export interface OrderProduct {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  imageUrl?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  meta?: {
    total: number;
    paginated: boolean;
  };
}

export interface ApiError {
  message: string;
  statusCode: number;
}

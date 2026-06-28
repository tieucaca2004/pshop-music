export type Category = {
  id: number;
  name: string;
  slug: string;
  position: number;
};

export type ProductImage = {
  id: number;
  url: string;
  alt: string | null;
  position: number;
  product_id: number;
};

export type Product = {
  id: number;
  name: string;
  slug: string;
  brand: string | null;
  price: string;
  compare_price: string | null;
  short_desc: string | null;
  description: string | null;
  specs: string | null;
  featured: number;
  in_stock: number;
  category_id: number;
  category_name?: string;
  category_slug?: string;
  images?: ProductImage[];
};

export type ContactOrder = {
  id: number;
  name: string;
  phone: string;
  email: string | null;
  product_id: number | null;
  message: string | null;
  status: string;
  created_at: string;
  product_name?: string;
};

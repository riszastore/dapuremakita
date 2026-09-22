import { beforeEach, describe, expect, it } from 'vitest';
import { addCartItem, cartTotal, readCart, saveCart, type CartItem } from '../src/order';

const product = { productId: 'product-1', slug: 'sambal', name: 'Sambal', price: 38000 };
beforeEach(() => localStorage.clear());

describe('cart persistence and arithmetic', () => {
  it('persists additions and merges the same product', () => {
    addCartItem(product); addCartItem(product);
    expect(readCart()).toEqual([{ ...product, quantity: 2 }]);
  });
  it('computes totals from durable item quantities', () => {
    const items: CartItem[] = [{ ...product, quantity: 2 }, { ...product, productId: 'product-2', price: 65000, quantity: 1 }];
    saveCart(items);
    expect(cartTotal(readCart())).toBe(141000);
  });
  it('recovers from malformed storage', () => {
    localStorage.setItem('dapuremakita.cart.v1', '{broken');
    expect(readCart()).toEqual([]);
  });
});

import { useEffect, useMemo, useState } from 'react';
import {
  Plus,
  Search,
  Package,
  Edit2,
  Trash2,
  X,
  Save,
  Loader2,
  Wrench,
  Settings,
  AlertTriangle,
  MapPin,
  SlidersHorizontal,
} from 'lucide-react';
import { supabase, type Product, type AdjustStockResult } from '@/lib/supabase';

type FormData = {
  product_code: string;
  name: string;
  category: 'tool' | 'spare_part';
  brand: string;
  description: string;
  quantity: string;
  price: string;
  min_stock: string;
  location: string;
};

const emptyForm: FormData = {
  product_code: '',
  name: '',
  category: 'tool',
  brand: '',
  description: '',
  quantity: '1',
  price: '0',
  min_stock: '0',
  location: '',
};

const NEW_BRAND = '__new__';
const CATEGORY_GROUPS = [
  { value: 'tool', label: 'Tools' },
  { value: 'spare_part', label: 'Spare Parts' },
] as const;

type AdjustMode = 'addition' | 'removal' | 'adjustment';

export default function ProductsPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterCat, setFilterCat] = useState<'all' | 'tool' | 'spare_part'>('all');
  const [filterBrand, setFilterBrand] = useState('all');
  const [showModal, setShowModal] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormData>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null);
  const [adjustMode, setAdjustMode] = useState<AdjustMode>('addition');
  const [adjustQty, setAdjustQty] = useState('1');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjusting, setAdjusting] = useState(false);
  const [adjustError, setAdjustError] = useState<string | null>(null);

  const loadProducts = async () => {
    setLoading(true);
    const { data, error: loadError } = await supabase
      .from('products')
      .select('*')
      .order('created_at', { ascending: false });
    if (loadError) {
      setError(loadError.message);
    } else {
      setProducts((data as Product[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const brands = useMemo(
    () => [...new Set(products.map((p) => p.brand).filter(Boolean))].sort((a, b) => a.localeCompare(b)),
    [products]
  );

  const filtered = products.filter((p) => {
    const q = search.toLowerCase();
    const matchesSearch =
      p.name.toLowerCase().includes(q) ||
      p.product_code.toLowerCase().includes(q) ||
      p.brand.toLowerCase().includes(q);
    const matchesCat = filterCat === 'all' || p.category === filterCat;
    const matchesBrand = filterBrand === 'all' || p.brand === filterBrand;
    return matchesSearch && matchesCat && matchesBrand;
  });

  const groups = CATEGORY_GROUPS.map((g) => ({
    ...g,
    items: filtered.filter((p) => p.category === g.value),
  })).filter((g) => g.items.length > 0);

  const openAdd = () => {
    setForm(emptyForm);
    setEditingId(null);
    setError(null);
    setShowModal(true);
  };

  const openEdit = (p: Product) => {
    setForm({
      product_code: p.product_code,
      name: p.name,
      category: p.category,
      brand: p.brand,
      description: p.description ?? '',
      quantity: String(p.quantity),
      price: String(p.price),
      min_stock: String(p.min_stock),
      location: p.location ?? '',
    });
    setEditingId(p.id);
    setError(null);
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    const brand = form.brand.trim();
    const quantity = parseInt(form.quantity, 10);
    const minStock = parseInt(form.min_stock, 10);
    const price = parseFloat(form.price);

    if (!name) { setError('Product name is required'); return; }
    if (!brand) { setError('Please select or enter a brand'); return; }
    if (!Number.isInteger(quantity) || quantity < 0) { setError('Quantity must be a whole number, zero or more'); return; }
    if (!Number.isInteger(minStock) || minStock < 0) { setError('Min stock must be a whole number, zero or more'); return; }
    if (!Number.isFinite(price) || price < 0) { setError('Price must be zero or more'); return; }

    setSaving(true);
    const shared = {
      name,
      category: form.category,
      brand,
      description: form.description.trim(),
      quantity,
      price,
      min_stock: minStock,
      location: form.location.trim(),
    };

    const result = editingId
      ? await supabase.from('products').update(shared).eq('id', editingId)
      : await supabase
          .from('products')
          .insert({ ...shared, product_code: form.product_code.trim().toUpperCase() })
          .select()
          .single();

    if (result.error) {
      setError(
        result.error.code === '23505'
          ? `Product ID "${form.product_code.trim().toUpperCase()}" is already in use. Choose a different ID.`
          : result.error.message
      );
      setSaving(false);
      return;
    }

    await loadProducts();
    setShowModal(false);
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    setSaving(true);
    const { error: delError } = await supabase.from('products').delete().eq('id', deleteId);
    if (delError) {
      setError(delError.message);
      setSaving(false);
      return;
    }
    setDeleteId(null);
    await loadProducts();
    setSaving(false);
  };

  const openAdjust = (p: Product) => {
    setAdjustProduct(p);
    setAdjustMode('addition');
    setAdjustQty('1');
    setAdjustNotes('');
    setAdjustError(null);
  };

  const handleAdjust = async () => {
    if (!adjustProduct) return;
    setAdjusting(true);
    setAdjustError(null);

    const qty = parseInt(adjustQty, 10);
    if (!Number.isInteger(qty) || qty < 0) {
      setAdjustError('Quantity must be a whole number, zero or more');
      setAdjusting(false);
      return;
    }

    const { data: resultData, error: rpcError } = await supabase.rpc('adjust_stock', {
      p_product_id: adjustProduct.id,
      p_action_type: adjustMode,
      p_quantity: qty,
      p_notes: adjustNotes.trim(),
      p_session_id: crypto.randomUUID(),
    });

    if (rpcError) {
      setAdjustError(rpcError.message);
      setAdjusting(false);
      return;
    }

    const r = (resultData as AdjustStockResult[])?.[0] ?? (resultData as AdjustStockResult);
    if (!r?.success) {
      setAdjustError(r?.message ?? 'Failed to adjust stock');
      setAdjusting(false);
      return;
    }

    await loadProducts();
    setAdjustProduct(null);
    setAdjusting(false);
  };

  const brandSelectValue = brands.includes(form.brand) ? form.brand : NEW_BRAND;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 animate-fade-in-up">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold text-navy-800">Products</h1>
          <p className="text-slate-500 mt-1 text-sm sm:text-base">Manage your inventory items</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 gradient-amber text-navy-800 font-bold px-4 py-2.5 rounded-xl transition-all hover:shadow-amber-glow active:scale-95"
        >
          <Plus className="w-5 h-5" strokeWidth={2.5} />
          <span className="text-sm">Add Product</span>
        </button>
      </div>

      {/* Search + filters */}
      <div className="flex flex-col lg:flex-row gap-3 animate-fade-in-up" style={{ animationDelay: '60ms' }}>
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, ID, or brand..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
          />
        </div>
        <select
          value={filterBrand}
          onChange={(e) => setFilterBrand(e.target.value)}
          className="px-4 py-3 bg-white border border-slate-200 rounded-xl text-navy-800 font-medium focus:outline-none focus:border-brand-500 cursor-pointer"
          aria-label="Filter by brand"
        >
          <option value="all">All brands</option>
          {brands.map((b) => (
            <option key={b} value={b}>{b}</option>
          ))}
        </select>
        <div className="flex gap-1 p-1 bg-white border border-slate-200 rounded-xl overflow-x-auto scrollbar-thin">
          {(['all', 'tool', 'spare_part'] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all whitespace-nowrap ${
                filterCat === cat
                  ? 'gradient-navy text-white shadow-premium'
                  : 'text-slate-500 hover:bg-slate-100'
              }`}
            >
              {cat === 'spare_part' ? 'Spare Parts' : cat === 'tool' ? 'Tools' : 'All'}
            </button>
          ))}
        </div>
      </div>

      {error && !showModal && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-medium">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="w-10 h-10 border-4 border-brand-200 border-t-brand-500 rounded-full animate-spin" />
        </div>
      ) : groups.length === 0 ? (
        <div className="card-premium p-12 text-center text-slate-400">
          <Package className="w-14 h-14 mx-auto mb-3 opacity-30" />
          <p className="font-semibold text-slate-500">No products found</p>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map((group, gi) => (
            <section key={group.value} className="space-y-4 animate-fade-in-up" style={{ animationDelay: `${120 + gi * 80}ms` }}>
              <div className="flex items-center gap-2.5">
                {group.value === 'tool' ? (
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-icon-blue">
                    <Settings className="w-4 h-4 text-white" />
                  </div>
                ) : (
                  <div className="flex items-center justify-center w-8 h-8 rounded-lg gradient-icon-amber">
                    <Wrench className="w-4 h-4 text-white" />
                  </div>
                )}
                <h2 className="font-bold text-lg text-navy-800">{group.label}</h2>
                <span className="text-sm font-semibold text-slate-600 bg-white border border-slate-200 px-2.5 py-0.5 rounded-full">
                  {group.items.length}
                </span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                {group.items.map((p, i) => {
                  const isLow = p.quantity <= p.min_stock && p.quantity > 0;
                  const isOut = p.quantity === 0;
                  return (
                    <div
                      key={p.id}
                      className="card-premium p-5 animate-fade-in-up"
                      style={{ animationDelay: `${i * 40}ms` }}
                    >
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2.5">
                          {p.category === 'tool' ? (
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-icon-blue shadow-navy-glow">
                              <Settings className="w-5 h-5 text-white" />
                            </div>
                          ) : (
                            <div className="flex items-center justify-center w-10 h-10 rounded-xl gradient-icon-amber shadow-amber-glow">
                              <Wrench className="w-5 h-5 text-white" />
                            </div>
                          )}
                          <div>
                            <p className="text-xs text-slate-400 font-bold tracking-wide">{p.product_code}</p>
                            <p className="text-sm text-slate-500 font-medium">
                              {p.category === 'spare_part' ? 'Spare Part' : 'Tool'}
                            </p>
                          </div>
                        </div>
                        <div className="flex gap-0.5">
                          <button
                            onClick={() => openAdjust(p)}
                            className="p-2 text-slate-400 hover:text-brand-600 hover:bg-brand-50 rounded-lg transition-colors active:scale-90"
                            title="Adjust stock"
                          >
                            <SlidersHorizontal className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => openEdit(p)}
                            className="p-2 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors active:scale-90"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => setDeleteId(p.id)}
                            className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors active:scale-90"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <h3 className="font-bold text-navy-800 text-lg leading-tight mb-1">{p.name}</h3>
                      <p className="text-sm text-slate-500 mb-1">{p.brand || 'No brand'}</p>
                      {p.location && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mb-3 font-medium">
                          <MapPin className="w-3.5 h-3.5" />
                          {p.location}
                        </p>
                      )}
                      {p.description && (
                        <p className="text-xs text-slate-500 mb-3 line-clamp-2">{p.description}</p>
                      )}

                      <div className="flex items-center gap-4 text-sm pt-1">
                        <div>
                          <p className="text-slate-400 text-xs font-medium">Stock</p>
                          <p className={`font-bold text-lg ${
                            isOut ? 'text-red-600' : isLow ? 'text-amber-600' : 'text-navy-800'
                          }`}>
                            {p.quantity}
                            {isLow && <AlertTriangle className="w-3.5 h-3.5 inline ml-1" />}
                          </p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-medium">Price</p>
                          <p className="font-bold text-navy-800">${p.price.toFixed(2)}</p>
                        </div>
                        <div>
                          <p className="text-slate-400 text-xs font-medium">Min</p>
                          <p className="font-semibold text-slate-700">{p.min_stock}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* Add/Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setShowModal(false)}>
          <div
            className="bg-white rounded-2xl shadow-premium-lg w-full max-w-lg max-h-[90vh] overflow-y-auto scrollbar-thin animate-fade-in-up"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-lg text-navy-800">
                {editingId ? 'Edit Product' : 'Add Product'}
              </h2>
              <button onClick={() => setShowModal(false)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors active:scale-90">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-1.5">Product ID</label>
                  <input
                    type="text"
                    value={form.product_code}
                    onChange={(e) => setForm({ ...form, product_code: e.target.value })}
                    disabled={!!editingId}
                    placeholder={editingId ? '' : 'Auto-generated'}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 disabled:text-slate-400 disabled:cursor-not-allowed transition-all"
                  />
                  <p className="text-xs text-slate-400 mt-1 font-medium">
                    {editingId ? 'Permanent. Cannot be changed.' : 'Leave blank to generate one.'}
                  </p>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-1.5">Brand</label>
                  <select
                    value={brandSelectValue}
                    onChange={(e) =>
                      setForm({ ...form, brand: e.target.value === NEW_BRAND ? '' : e.target.value })
                    }
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 cursor-pointer"
                  >
                    <option value={NEW_BRAND}>+ New brand</option>
                    {brands.map((b) => (
                      <option key={b} value={b}>{b}</option>
                    ))}
                  </select>
                  {brandSelectValue === NEW_BRAND && (
                    <input
                      type="text"
                      value={form.brand}
                      onChange={(e) => setForm({ ...form, brand: e.target.value })}
                      required
                      placeholder="Enter brand name"
                      className="w-full mt-2 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 transition-all"
                    />
                  )}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                  placeholder="Torque Wrench 1/2 inch"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  placeholder="Brief description of the product..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Category</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: 'tool' })}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                      form.category === 'tool'
                        ? 'border-brand-500 bg-brand-50 text-brand-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Settings className="w-5 h-5" />
                    <span className="text-sm font-semibold">Tool (Reusable)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setForm({ ...form, category: 'spare_part' })}
                    className={`flex items-center gap-2 px-4 py-3 rounded-xl border-2 transition-all ${
                      form.category === 'spare_part'
                        ? 'border-amber-500 bg-amber-50 text-amber-700'
                        : 'border-slate-200 text-slate-500 hover:border-slate-300'
                    }`}
                  >
                    <Wrench className="w-5 h-5" />
                    <span className="text-sm font-semibold">Spare Part</span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Location</label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Shelf A-3, Bin 12"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 placeholder-slate-400 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                />
              </div>

              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-1.5">Quantity</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.quantity}
                    onChange={(e) => setForm({ ...form, quantity: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-1.5">Price ($)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price}
                    onChange={(e) => setForm({ ...form, price: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-navy-700 mb-1.5">Min Stock</label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={form.min_stock}
                    onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                  />
                </div>
              </div>

              {error && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-medium">
                  {error}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 flex items-center justify-center gap-2 gradient-amber text-navy-800 font-bold py-3 rounded-xl transition-all hover:shadow-amber-glow active:scale-95 disabled:opacity-50"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" strokeWidth={2.5} />}
                  {editingId ? 'Save Changes' : 'Add Product'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Stock adjustment modal */}
      {adjustProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setAdjustProduct(null)}>
          <div className="bg-white rounded-2xl shadow-premium-lg w-full max-w-md max-h-[90vh] overflow-y-auto scrollbar-thin animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 sticky top-0 bg-white z-10">
              <h2 className="font-bold text-lg text-navy-800">Adjust Stock</h2>
              <button onClick={() => setAdjustProduct(null)} className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors active:scale-90">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-gradient-brand rounded-xl p-4 text-white">
                <p className="font-bold text-lg">{adjustProduct.name}</p>
                <p className="text-sm text-white/80">{adjustProduct.product_code} · Current stock: {adjustProduct.quantity}</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Action</label>
                <div className="grid grid-cols-3 gap-2">
                  {([
                    { id: 'addition', label: 'Add' },
                    { id: 'removal', label: 'Remove' },
                    { id: 'adjustment', label: 'Set To' },
                  ] as const).map((m) => (
                    <button
                      key={m.id}
                      onClick={() => setAdjustMode(m.id)}
                      className={`px-3 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                        adjustMode === m.id
                          ? 'border-amber-500 bg-amber-50 text-amber-700'
                          : 'border-slate-200 text-slate-500 hover:border-slate-300'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">
                  {adjustMode === 'adjustment' ? 'New Stock Level' : 'Quantity'}
                </label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={adjustQty}
                  onChange={(e) => setAdjustQty(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-navy-700 mb-1.5">Notes (optional)</label>
                <textarea
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="Reason for adjustment..."
                  rows={2}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-navy-800 focus:outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100 resize-none transition-all"
                />
              </div>

              {adjustError && (
                <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl px-4 py-3 font-medium">
                  {adjustError}
                </div>
              )}

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setAdjustProduct(null)}
                  className="flex-1 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 transition-colors active:scale-95"
                >
                  Cancel
                </button>
                <button
                  onClick={handleAdjust}
                  disabled={adjusting}
                  className="flex-1 flex items-center justify-center gap-2 gradient-amber text-navy-800 font-bold py-3 rounded-xl transition-all hover:shadow-amber-glow active:scale-95 disabled:opacity-50"
                >
                  {adjusting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" strokeWidth={2.5} />}
                  Confirm
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-navy-900/60 backdrop-blur-sm animate-fade-in" onClick={() => setDeleteId(null)}>
          <div className="bg-white rounded-2xl shadow-premium-lg w-full max-w-sm p-6 animate-fade-in-up" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center justify-center w-12 h-12 rounded-full bg-red-50">
                <Trash2 className="w-6 h-6 text-red-600" />
              </div>
              <h2 className="font-bold text-lg text-navy-800">Delete Product?</h2>
            </div>
            <p className="text-slate-500 text-sm mb-5">
              This will permanently remove the product and all its transaction history.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 py-3 border border-slate-200 text-slate-700 font-semibold rounded-xl hover:bg-slate-50 active:scale-95 transition-all"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={saving}
                className="flex-1 bg-red-600 hover:bg-red-700 text-white font-bold py-3 rounded-xl transition-colors active:scale-95 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin mx-auto" /> : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

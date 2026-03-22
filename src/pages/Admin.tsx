import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp, deleteField } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { Plus, Edit, Trash2, X, LogIn, LogOut } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';

export default function Admin() {
  const { user, isAdmin, login, logout } = useAuth();
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [listingToDelete, setListingToDelete] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  
  const [formData, setFormData] = useState<Partial<Listing>>({
    title: '', description: '', location: '', pricePerNight: 0, pricePerWeek: 0, pricePerMonth: 0, maxGuests: 1,
    floorArea: 0, bedrooms: 1, bathrooms: 1,
    checkInTime: '14:00', checkOutTime: '11:00', amenities: [], houseRules: '', photos: [], categorizedPhotos: [], icalUrls: []
  });

  // Local state for editing categorized photos as text
  const [photoCategoriesInput, setPhotoCategoriesInput] = useState<{category: string, urls: string}[]>([
    { category: 'Exterior', urls: '' },
    { category: 'Living Room', urls: '' },
    { category: 'Bedrooms', urls: '' },
    { category: 'Washroom', urls: '' },
    { category: 'Kitchen', urls: '' },
  ]);

  const fetchListings = async () => {
    setLoading(true);
    try {
      setError(null);
      const querySnapshot = await getDocs(collection(db, 'listings'));
      const fetchedListings = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as Listing[];
      setListings(fetchedListings);
    } catch (err) {
      console.error("Error fetching listings:", err);
      try {
        handleFirestoreError(err, OperationType.LIST, 'listings');
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to fetch listings');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isAdmin) fetchListings();
  }, [isAdmin]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex flex-col items-center justify-center">
        <h2 className="text-2xl font-bold mb-4 text-gray-900">Admin Access</h2>
        <button onClick={login} className="bg-emerald-600 text-white px-6 py-3 rounded-lg flex items-center gap-2 hover:bg-emerald-700 transition-colors">
          <LogIn className="w-5 h-5" /> Owner Login
        </button>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-600 mb-4 text-lg">Access Denied. You must be an admin to view this page.</p>
        <button onClick={logout} className="text-gray-600 hover:text-gray-900 underline">Logout</button>
      </div>
    );
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setError(null);
      // Clean up arrays and categorized photos
      const cleanedCategorizedPhotos = photoCategoriesInput
        .map(pc => ({
          category: pc.category,
          urls: pc.urls.split('\n').map(s => s.trim()).filter(Boolean)
        }))
        .filter(pc => pc.urls.length > 0);

      // Extract all photos for the flat array (backward compatibility / main gallery fallback)
      const allPhotos = cleanedCategorizedPhotos.flatMap(pc => pc.urls);

      const dataToSave = {
        ...formData,
        photos: allPhotos,
        categorizedPhotos: cleanedCategorizedPhotos,
        amenities: formData.amenities?.map(s => s.trim()).filter(Boolean) || [],
        icalUrls: formData.icalUrls?.map(s => s.trim()).filter(Boolean) || []
      };

      // Clean up undefined values for creation, use deleteField() for updates
      const cleanedDataForCreate = Object.fromEntries(
        Object.entries(dataToSave).filter(([_, v]) => v !== undefined)
      );
      
      const cleanedDataForUpdate = Object.fromEntries(
        Object.entries(dataToSave).map(([k, v]) => [k, v === undefined ? deleteField() : v])
      );

      if (editingId) {
        await updateDoc(doc(db, 'listings', editingId), {
          ...cleanedDataForUpdate,
          updatedAt: serverTimestamp()
        });
      } else {
        await addDoc(collection(db, 'listings'), {
          ...cleanedDataForCreate,
          createdAt: serverTimestamp()
        });
      }
      setIsModalOpen(false);
      fetchListings();
    } catch (err) {
      console.error("Error saving listing:", err);
      try {
        handleFirestoreError(err, editingId ? OperationType.UPDATE : OperationType.CREATE, editingId ? `listings/${editingId}` : 'listings');
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to save listing');
      }
    }
  };

  const handleDelete = (id: string) => {
    setListingToDelete(id);
  };

  const confirmDelete = async () => {
    if (!listingToDelete) return;
    try {
      setError(null);
      await deleteDoc(doc(db, 'listings', listingToDelete));
      setListingToDelete(null);
      fetchListings();
    } catch (err) {
      console.error("Error deleting listing:", err);
      try {
        handleFirestoreError(err, OperationType.DELETE, `listings/${listingToDelete}`);
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to delete listing');
      }
    }
  };

  const openEditModal = (listing: Listing) => {
    setEditingId(listing.id);
    setFormData(listing);
    
    // Populate photo categories input
    const defaultCategories = ['Exterior', 'Living Room', 'Bedrooms', 'Washroom', 'Kitchen'];
    const existingCats = listing.categorizedPhotos || [];
    
    const newInputs = defaultCategories.map(cat => {
      const found = existingCats.find(c => c.category === cat);
      return {
        category: cat,
        urls: found ? found.urls.join('\n') : ''
      };
    });
    
    // Add any custom categories that might exist
    existingCats.forEach(cat => {
      if (!defaultCategories.includes(cat.category)) {
        newInputs.push({ category: cat.category, urls: cat.urls.join('\n') });
      }
    });

    setPhotoCategoriesInput(newInputs);
    setIsModalOpen(true);
  };

  const openCreateModal = () => {
    setEditingId(null);
    setFormData({
      title: '', description: '', location: '', pricePerNight: 0, pricePerWeek: 0, pricePerMonth: 0, maxGuests: 1,
      floorArea: 0, bedrooms: 1, bathrooms: 1,
      checkInTime: '14:00', checkOutTime: '11:00', amenities: [], houseRules: '', photos: [], categorizedPhotos: [], icalUrls: []
    });
    setPhotoCategoriesInput([
      { category: 'Exterior', urls: '' },
      { category: 'Living Room', urls: '' },
      { category: 'Bedrooms', urls: '' },
      { category: 'Washroom', urls: '' },
      { category: 'Kitchen', urls: '' },
    ]);
    setIsModalOpen(true);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900">Manage Listings</h1>
        <div className="flex items-center gap-4">
          <button onClick={logout} className="text-gray-600 hover:text-red-600 flex items-center gap-1">
            <LogOut className="w-4 h-4" /> Logout
          </button>
          <button onClick={openCreateModal} className="bg-emerald-600 text-white px-4 py-2 rounded-lg flex items-center gap-2 hover:bg-emerald-700">
            <Plus className="w-5 h-5" /> Add Listing
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-8 relative">
          <div className="flex justify-between items-start">
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-10">Loading...</div>
      ) : (
        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Title</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price/Night</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Export iCal</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {listings.map(listing => (
                <tr key={listing.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{listing.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{listing.location}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${listing.pricePerNight}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    <button 
                      onClick={() => {
                        const url = `${window.location.origin}/api/${listing.id}-calendar.ics`;
                        navigator.clipboard.writeText(url);
                        setCopiedId(listing.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      className="text-blue-600 hover:text-blue-800 underline text-xs"
                    >
                      {copiedId === listing.id ? 'Copied!' : 'Copy iCal URL'}
                    </button>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button onClick={() => openEditModal(listing)} className="text-emerald-600 hover:text-emerald-900 mr-4">
                      <Edit className="w-5 h-5" />
                    </button>
                    <button onClick={() => handleDelete(listing.id)} className="text-red-600 hover:text-red-900">
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {listingToDelete && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Delete Listing</h2>
            <p className="text-gray-600 mb-6">Are you sure you want to delete this listing? This action cannot be undone.</p>
            <div className="flex justify-end gap-4">
              <button 
                onClick={() => setListingToDelete(null)} 
                className="px-4 py-2 text-gray-600 hover:text-gray-900 font-medium"
              >
                Cancel
              </button>
              <button 
                onClick={confirmDelete} 
                className="bg-red-600 text-white px-4 py-2 rounded-lg hover:bg-red-700 font-medium"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit/Create Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-4xl my-8">
            <div className="flex justify-between items-center p-6 border-b border-gray-100 sticky top-0 bg-white rounded-t-xl z-10">
              <h2 className="text-2xl font-bold">{editingId ? 'Edit Listing' : 'Add New Listing'}</h2>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-500 hover:text-gray-700">
                <X className="w-6 h-6" />
              </button>
            </div>
            <form onSubmit={handleSave} className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Title</label>
                  <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                  <textarea required rows={4} value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Location</label>
                  <input required type="text" value={formData.location} onChange={e => setFormData({...formData, location: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                
                {/* Pricing & Capacity */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Price Per Night ($)</label>
                  <input required type="number" min="0" value={formData.pricePerNight} onChange={e => setFormData({...formData, pricePerNight: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Weekly Price ($) (Optional)</label>
                  <input type="number" min="0" value={formData.pricePerWeek || ''} onChange={e => setFormData({...formData, pricePerWeek: e.target.value ? Number(e.target.value) : undefined})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monthly Price ($) (Optional)</label>
                  <input type="number" min="0" value={formData.pricePerMonth || ''} onChange={e => setFormData({...formData, pricePerMonth: e.target.value ? Number(e.target.value) : undefined})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Max Guests</label>
                  <input required type="number" min="1" value={formData.maxGuests} onChange={e => setFormData({...formData, maxGuests: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Total Floor Area (sq ft/m)</label>
                  <input type="number" min="0" value={formData.floorArea || ''} onChange={e => setFormData({...formData, floorArea: e.target.value ? Number(e.target.value) : undefined})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bedrooms</label>
                  <input type="number" min="0" value={formData.bedrooms || ''} onChange={e => setFormData({...formData, bedrooms: e.target.value ? Number(e.target.value) : undefined})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bathrooms</label>
                  <input type="number" min="0" value={formData.bathrooms || ''} onChange={e => setFormData({...formData, bathrooms: e.target.value ? Number(e.target.value) : undefined})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-in Time</label>
                  <input type="text" placeholder="e.g., 14:00" value={formData.checkInTime || ''} onChange={e => setFormData({...formData, checkInTime: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Check-out Time</label>
                  <input type="text" placeholder="e.g., 11:00" value={formData.checkOutTime || ''} onChange={e => setFormData({...formData, checkOutTime: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>

                {/* Arrays (Photos & Amenities) */}
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-2">Categorized Photos (One URL per line)</label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {photoCategoriesInput.map((pc, idx) => (
                      <div key={idx} className="border border-gray-200 p-3 rounded-lg bg-gray-50">
                        <label className="block text-xs font-bold text-gray-700 uppercase mb-1">{pc.category}</label>
                        <textarea 
                          rows={3} 
                          value={pc.urls} 
                          onChange={e => {
                            const newInputs = [...photoCategoriesInput];
                            newInputs[idx].urls = e.target.value;
                            setPhotoCategoriesInput(newInputs);
                          }} 
                          className="w-full border border-gray-300 rounded p-2 text-sm" 
                          placeholder={`https://example.com/${pc.category.toLowerCase().replace(' ', '')}1.jpg`} 
                        />
                      </div>
                    ))}
                  </div>
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amenities (One per line)</label>
                  <textarea rows={4} value={formData.amenities?.join('\n') || ''} onChange={e => setFormData({...formData, amenities: e.target.value.split('\n')})} className="w-full border border-gray-300 rounded-lg p-2" placeholder="Free WiFi&#10;Air Conditioning&#10;Pool" />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">iCal URLs (One URL per line)</label>
                  <textarea rows={2} value={formData.icalUrls?.join('\n') || ''} onChange={e => setFormData({...formData, icalUrls: e.target.value.split('\n')})} className="w-full border border-gray-300 rounded-lg p-2" placeholder="https://www.airbnb.com/calendar/ical/..." />
                </div>
                <div className="md:col-span-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">House Rules</label>
                  <textarea rows={3} value={formData.houseRules || ''} onChange={e => setFormData({...formData, houseRules: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" />
                </div>
              </div>
              <div className="flex justify-end gap-4 pt-4 border-t border-gray-100">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-gray-600 hover:text-gray-900">Cancel</button>
                <button type="submit" className="bg-emerald-600 text-white px-6 py-2 rounded-lg hover:bg-emerald-700">Save Listing</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

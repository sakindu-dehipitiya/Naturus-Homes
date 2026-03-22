import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { doc, getDoc, collection, addDoc, query, where, getDocs, serverTimestamp, orderBy, Timestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing as ListingType, Review } from '../types';
import { MapPin, Users, Check, Clock, Info, Star, Loader2, CalendarSync, X, Bed, Bath, Maximize } from 'lucide-react';
import { DayPicker } from 'react-day-picker';
import 'react-day-picker/dist/style.css';
import { differenceInDays } from 'date-fns';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { motion } from 'motion/react';
import syncICalFeeds from '../../server';

export default function Listing() {
  syncICalFeeds()
  const { id } = useParams<{ id: string }>();
  const [listing, setListing] = useState<ListingType | null>(null);
  const [loading, setLoading] = useState(true);
  
  // Booking state
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [guestName, setGuestName] = useState('');
  const [nationality, setNationality] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [numberOfGuests, setNumberOfGuests] = useState(1);
  const [checkInTime, setCheckInTime] = useState('');
  const [specialRequests, setSpecialRequests] = useState('');
  
  const [bookingLoading, setBookingLoading] = useState(false);
  const [bookedDates, setBookedDates] = useState<Date[]>([]);
  const [bookingSuccess, setBookingSuccess] = useState(false);

  // Reviews state
  const [reviews, setReviews] = useState<Review[]>([]);
  const [reviewForm, setReviewForm] = useState({ guestName: '', rating: 5, comment: '' });
  const [reviewSubmitting, setReviewSubmitting] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);

  const [selectedCategory, setSelectedCategory] = useState<string>('All');
  const [showGalleryModal, setShowGalleryModal] = useState(false);

  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListingAndData = async () => {
      if (!id) return;
      try {
        setError(null);
        const docRef = doc(db, 'listings', id);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          setListing({ id: docSnap.id, ...docSnap.data() } as ListingType);
        }

        // Fetch internal booked dates
        const qBookings = query(collection(db, 'bookings'), where('listingId', '==', id));
        const bookingsSnap = await getDocs(qBookings);
        const dates: Date[] = [];
        bookingsSnap.forEach(b => {
          const data = b.data();
          if (data.status === 'pending' || data.status === 'confirmed') {
            const start = data.startDate.toDate();
            const end = data.endDate.toDate();
            
            // Internal bookings use local time
            const localStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
            const localEnd = new Date(end.getFullYear(), end.getMonth(), end.getDate());
            
            let current = new Date(localStart);
            while (current <= localEnd) {
              dates.push(new Date(current));
              current.setDate(current.getDate() + 1);
            }
          }
        });

        // Fetch external booked dates
        const qExternalBookings = query(collection(db, 'external_bookings'), where('listingId', '==', id));
        const externalSnap = await getDocs(qExternalBookings);
        externalSnap.forEach(b => {
          const data = b.data();
          if (data.startDate && data.endDate) {
            const start = data.startDate.toDate();
            const end = data.endDate.toDate();
            
            // External bookings from iCal are parsed as UTC midnight, so we use UTC components
            const localStart = new Date(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate());
            const localEnd = new Date(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate());
            
            let current = new Date(localStart);
            while (current <= localEnd) {
              dates.push(new Date(current));
              current.setDate(current.getDate() + 1);
            }
          }
        });

        setBookedDates(dates);

        // Fetch reviews
        const qReviews = query(collection(db, 'reviews'), where('listingId', '==', id));
        const reviewsSnap = await getDocs(qReviews);
        const fetchedReviews = reviewsSnap.docs
          .map(doc => ({ id: doc.id, ...doc.data() }) as Review)
          .sort((a, b) => {
             const timeA = a.createdAt?.toMillis ? a.createdAt.toMillis() : 0;
             const timeB = b.createdAt?.toMillis ? b.createdAt.toMillis() : 0;
             return timeB - timeA;
          });
        setReviews(fetchedReviews);

      } catch (err) {
        console.error("Error fetching data:", err);
        try {
          handleFirestoreError(err, OperationType.GET, `listings/${id} or related data`);
        } catch (e: any) {
          const parsed = JSON.parse(e.message);
          setError(parsed.error || 'Failed to fetch listing data');
        }
      } finally {
        setLoading(false);
      }
    };
    fetchListingAndData();
  }, [id]);

  const handleBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id || !listing || !dateRange?.from || !dateRange?.to) return;
    
    setBookingLoading(true);

    try {
      setError(null);
      const days = differenceInDays(dateRange.to, dateRange.from);
      let totalPrice = 0;
      if (days >= 28 && listing.pricePerMonth) {
        totalPrice = (listing.pricePerMonth / 28) * days;
      } else if (days >= 7 && listing.pricePerWeek) {
        totalPrice = (listing.pricePerWeek / 7) * days;
      } else {
        totalPrice = days * listing.pricePerNight;
      }

      const bookingData: any = {
        listingId: id,
        guestName,
        nationality,
        guestEmail,
        phoneNumber,
        numberOfGuests,
        startDate: Timestamp.fromDate(new Date(Date.UTC(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate()))),
        endDate: Timestamp.fromDate(new Date(Date.UTC(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate()))),
        status: 'confirmed', // Instant booking
        totalPrice: Number(totalPrice.toFixed(2)),
        createdAt: serverTimestamp()
      };

      if (checkInTime) bookingData.checkInTime = checkInTime;
      if (specialRequests) bookingData.specialRequests = specialRequests;

      await addDoc(collection(db, 'bookings'), bookingData);
      
      // Update local booked dates state so they are immediately blocked
      const newBookedDates: Date[] = [];
      const localStart = new Date(dateRange.from.getFullYear(), dateRange.from.getMonth(), dateRange.from.getDate());
      const localEnd = new Date(dateRange.to.getFullYear(), dateRange.to.getMonth(), dateRange.to.getDate());
      
      let current = new Date(localStart);
      while (current <= localEnd) {
        newBookedDates.push(new Date(current));
        current.setDate(current.getDate() + 1);
      }
      setBookedDates(prev => [...prev, ...newBookedDates]);
      
      // Send confirmation emails via our backend API
      try {
        const guestEmailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">Booking Confirmation</h2>
            <p>Hi ${guestName},</p>
            <p>Thank you for choosing <strong>${listing.title}</strong>! Your booking has been successfully confirmed.</p>
            
            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
              <h3 style="margin-top: 0; color: #111827;">Your Trip Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Check-in:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${dateRange.from.toLocaleDateString()}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Check-out:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${dateRange.to.toLocaleDateString()}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Guests:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${numberOfGuests}</td></tr>
                <tr><td style="padding: 8px 0;"><strong>Total Price:</strong></td><td style="padding: 8px 0; text-align: right; font-weight: bold; color: #059669;">$${totalPrice.toFixed(2)}</td></tr>
              </table>
            </div>
            
            <p>If you have any questions or need to make changes to your reservation, please reply directly to this email.</p>
            <p>We look forward to hosting you!</p>
            <p style="color: #6b7280; font-size: 0.875rem; margin-top: 30px;">Best regards,<br>${listing.title} Team</p>
          </div>
        `;

        const ownerEmailHtml = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
            <h2 style="color: #2563eb; border-bottom: 2px solid #2563eb; padding-bottom: 10px;">New Booking Alert</h2>
            <p>You have received a new confirmed booking for <strong>${listing.title}</strong>.</p>
            
            <div style="background-color: #f0fdf4; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #bbf7d0;">
              <h3 style="margin-top: 0; color: #166534;">Guest Information</h3>
              <p style="margin: 5px 0;"><strong>Name:</strong> ${guestName}</p>
              <p style="margin: 5px 0;"><strong>Nationality:</strong> ${nationality}</p>
              <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${guestEmail}">${guestEmail}</a></p>
              <p style="margin: 5px 0;"><strong>Phone:</strong> ${phoneNumber}</p>
            </div>

            <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
              <h3 style="margin-top: 0; color: #111827;">Reservation Details</h3>
              <table style="width: 100%; border-collapse: collapse;">
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Check-in:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${dateRange.from.toLocaleDateString()} ${checkInTime ? `(Est. ${checkInTime})` : ''}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Check-out:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${dateRange.to.toLocaleDateString()}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Guests:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right;">${numberOfGuests}</td></tr>
                <tr><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb;"><strong>Total Price:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: bold; color: #059669;">$${totalPrice.toFixed(2)}</td></tr>
                <tr><td style="padding: 8px 0; vertical-align: top;"><strong>Special Requests:</strong></td><td style="padding: 8px 0; text-align: right; color: #dc2626;">${specialRequests ? specialRequests : "None"}</td></tr>
              </table>
            </div>
          </div>
        `;
        
        // Send to Guest
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: guestEmail,
            subject: `Booking Confirmed: ${listing.title}`,
            html: guestEmailHtml
          })
        });

        // Send to Owner
        await fetch('/api/send-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: import.meta.env.VITE_OWNER_EMAIL,
            subject: `New Booking: ${listing.title} - ${guestName}`,
            html: ownerEmailHtml
          })
        });
      } catch (emailErr) {
        console.error("Failed to send confirmation email:", emailErr);
        // We don't fail the booking if the email fails
      }

      setBookingSuccess(true);
      setDateRange({ from: undefined, to: undefined });
      setGuestName('');
      setNationality('');
      setGuestEmail('');
      setPhoneNumber('');
      setNumberOfGuests(1);
      setCheckInTime('');
      setSpecialRequests('');
    } catch (err) {
      console.error("Error booking:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'bookings');
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to submit booking');
      }
    } finally {
      setBookingLoading(false);
    }
  };

  const handleReviewSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!id) return;
    setReviewSubmitting(true);
    try {
      setError(null);
      const newReview = {
        listingId: id,
        guestName: reviewForm.guestName,
        rating: reviewForm.rating,
        comment: reviewForm.comment,
        createdAt: serverTimestamp()
      };
      await addDoc(collection(db, 'reviews'), newReview);
      setReviewSuccess(true);
      setReviewForm({ guestName: '', rating: 5, comment: '' });
      
      // Optimistically update reviews list
      setReviews([{ id: 'temp', ...newReview, createdAt: { toDate: () => new Date() } } as any, ...reviews]);
    } catch (err) {
      console.error("Error submitting review:", err);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'reviews');
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to submit review');
      }
    } finally {
      setReviewSubmitting(false);
    }
  };

  if (loading) return <div className="text-center py-20 flex flex-col items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600 mb-4" /> Loading...</div>;
  if (!listing) return <div className="text-center py-20 text-red-600">Listing not found.</div>;

  const daysSelected = dateRange?.from && dateRange?.to ? differenceInDays(dateRange.to, dateRange.from) : 0;
  
  let totalPrice = 0;
  let appliedRate = 'Daily Rate';
  let discount = 0;
  
  if (daysSelected > 0) {
    const basePrice = daysSelected * listing.pricePerNight;
    if (daysSelected >= 28 && listing.pricePerMonth) {
      totalPrice = (listing.pricePerMonth / 28) * daysSelected;
      discount = basePrice - totalPrice;
      appliedRate = 'Monthly Rate Applied';
    } else if (daysSelected >= 7 && listing.pricePerWeek) {
      totalPrice = (listing.pricePerWeek / 7) * daysSelected;
      discount = basePrice - totalPrice;
      appliedRate = 'Weekly Rate Applied';
    } else {
      totalPrice = basePrice;
    }
  }

  const averageRating = reviews.length > 0 
    ? (reviews.reduce((acc, rev) => acc + rev.rating, 0) / reviews.length).toFixed(1) 
    : 'New';

  const handleDateSelect = (range: any) => {
    if (range?.from && range?.to) {
      // Check if any date in the range is booked
      let current = new Date(range.from);
      let isOverlapping = false;
      while (current <= range.to) {
        if (bookedDates.some(d => d.toDateString() === current.toDateString())) {
          isOverlapping = true;
          break;
        }
        current.setDate(current.getDate() + 1);
      }
      
      if (isOverlapping) {
        // If overlapping, just select the start date
        setDateRange({ from: range.from, to: undefined });
        return;
      }
    }
    setDateRange(range);
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="bg-white min-h-screen pb-24"
    >
      {error && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          <div className="bg-red-50 border-l-4 border-red-500 p-4 relative">
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
        </div>
      )}

      {/* Photo Gallery */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <motion.div 
          initial={{ y: 20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.5 }}
          className="flex justify-between items-end mb-6"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-gray-900">{listing.title}</h1>
          <div className="flex items-center gap-2 text-lg font-semibold text-gray-700">
            <Star className="w-5 h-5 fill-emerald-500 text-emerald-500" />
            {averageRating} <span className="text-gray-400 font-normal text-sm">({reviews.length} reviews)</span>
          </div>
        </motion.div>
        
        {(() => {
          const getAllPhotos = () => {
            if (!listing?.categorizedPhotos || listing.categorizedPhotos.length === 0) {
              return listing?.photos || [];
            }
            
            // Find first photo of specific categories
            const ext = listing.categorizedPhotos.find(c => c.category.toLowerCase() === 'exterior')?.urls[0];
            const liv = listing.categorizedPhotos.find(c => c.category.toLowerCase() === 'living room')?.urls[0];
            const bed = listing.categorizedPhotos.find(c => c.category.toLowerCase() === 'bedrooms')?.urls[0];
            
            const priorityPhotos = [ext, liv, bed].filter(Boolean) as string[];
            const otherPhotos = listing.categorizedPhotos
              .flatMap(c => c.urls)
              .filter(url => !priorityPhotos.includes(url));
              
            return [...priorityPhotos, ...otherPhotos];
          };

          const allPhotos = getAllPhotos();

          const categories = listing?.categorizedPhotos 
            ? ['All', ...listing.categorizedPhotos.filter(c => c.urls.length > 0).map(c => c.category)]
            : ['All'];

          const displayPhotos = selectedCategory === 'All' 
            ? allPhotos 
            : listing?.categorizedPhotos?.find(c => c.category === selectedCategory)?.urls || [];

          return (
            <>
              {categories.length > 1 && (
                <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                  {categories.map(cat => (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                        selectedCategory === cat 
                          ? 'bg-emerald-600 text-white' 
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              )}
              
              {displayPhotos.length === 0 ? (
                <div className="rounded-2xl overflow-hidden h-[50vh] bg-gray-100 flex items-center justify-center text-gray-400">
                  No photos available
                </div>
              ) : displayPhotos.length === 1 ? (
                <div className="rounded-2xl overflow-hidden h-[50vh] cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setShowGalleryModal(true)}>
                  <img src={displayPhotos[0]} alt="Gallery" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                </div>
              ) : displayPhotos.length === 2 ? (
                <div className="grid grid-cols-2 gap-2 rounded-2xl overflow-hidden h-[50vh]">
                  <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[0]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                  <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[1]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                </div>
              ) : displayPhotos.length === 3 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-2xl overflow-hidden h-[50vh]">
                  <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[0]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                  <div className="grid grid-rows-2 gap-2 h-full">
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[1]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[2]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-2xl overflow-hidden h-[50vh]">
                  <div className="md:col-span-2 h-full">
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[0]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                  </div>
                  <div className="grid grid-rows-2 gap-2 h-full hidden md:grid">
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[1]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[2]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                  </div>
                  <div className="grid grid-rows-2 gap-2 h-full hidden md:grid">
                    <img onClick={() => setShowGalleryModal(true)} src={displayPhotos[3]} alt="Gallery" className="w-full h-full object-cover cursor-pointer hover:opacity-90 transition-opacity" referrerPolicy="no-referrer" />
                    {displayPhotos.length > 4 ? (
                      <div className="relative h-full cursor-pointer hover:opacity-90 transition-opacity" onClick={() => setShowGalleryModal(true)}>
                        <img src={displayPhotos[4]} alt="Gallery" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        {displayPhotos.length > 5 && (
                          <div className="absolute inset-0 bg-black/40 flex items-center justify-center text-white font-bold text-xl">
                            +{displayPhotos.length - 5} photos
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="bg-gray-100 h-full"></div>
                    )}
                  </div>
                </div>
              )}

              {/* Full Screen Gallery Modal */}
              {showGalleryModal && (
                <div className="fixed inset-0 bg-black z-50 flex flex-col">
                  <div className="p-4 flex justify-between items-center bg-black text-white">
                    <span className="font-semibold">{selectedCategory === 'All' ? 'All Photos' : `${selectedCategory} Photos`} ({displayPhotos.length})</span>
                    <button onClick={() => setShowGalleryModal(false)} className="p-2 hover:bg-gray-800 rounded-full transition-colors">
                      <X className="w-6 h-6" />
                    </button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-8 bg-black">
                    <div className="max-w-4xl mx-auto flex flex-col gap-8">
                      {displayPhotos.map((url, idx) => (
                        <img key={idx} src={url} alt={`Gallery ${idx + 1}`} className="w-full h-auto object-contain max-h-[85vh]" referrerPolicy="no-referrer" />
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </>
          );
        })()}
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 grid grid-cols-1 lg:grid-cols-3 gap-12">
        {/* Main Content */}
        <motion.div 
          initial={{ x: -20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.2 }}
          className="lg:col-span-2 space-y-10"
        >
          
          {/* Details */}
          <section>
            <div className="flex flex-wrap gap-6 text-gray-600 border-b border-gray-200 pb-6">
              <div className="flex items-center gap-2"><MapPin className="w-5 h-5 text-emerald-600" /> {listing.location}</div>
              <div className="flex items-center gap-2"><Users className="w-5 h-5 text-emerald-600" /> Up to {listing.maxGuests} guests</div>
              {listing.bedrooms !== undefined && (
                <div className="flex items-center gap-2"><Bed className="w-5 h-5 text-emerald-600" /> {listing.bedrooms} Bedroom{listing.bedrooms !== 1 ? 's' : ''}</div>
              )}
              {listing.bathrooms !== undefined && (
                <div className="flex items-center gap-2"><Bath className="w-5 h-5 text-emerald-600" /> {listing.bathrooms} Bathroom{listing.bathrooms !== 1 ? 's' : ''}</div>
              )}
              {listing.floorArea !== undefined && (
                <div className="flex items-center gap-2"><Maximize className="w-5 h-5 text-emerald-600" /> {listing.floorArea} sq ft</div>
              )}
              <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-600" /> Check-in: {listing.checkInTime || '14:00'}</div>
              <div className="flex items-center gap-2"><Clock className="w-5 h-5 text-emerald-600" /> Check-out: {listing.checkOutTime || '11:00'}</div>
            </div>
            <div className="mt-6 text-gray-700 leading-relaxed whitespace-pre-line">
              {listing.description}
            </div>
          </section>

          {/* Amenities */}
          <section>
            <h2 className="text-2xl font-bold text-gray-900 mb-6">What this place offers</h2>
            <div className="grid grid-cols-2 gap-4">
              {listing.amenities?.map((amenity, idx) => (
                <div key={idx} className="flex items-center gap-3 text-gray-700">
                  <Check className="w-5 h-5 text-emerald-600" /> {amenity}
                </div>
              ))}
            </div>
          </section>

          {/* Reviews Section */}
          <section className="border-t border-gray-200 pt-10">
            <h2 className="text-2xl font-bold text-gray-900 mb-6 flex items-center gap-2">
              <Star className="w-6 h-6 fill-emerald-500 text-emerald-500" />
              Guest Reviews
            </h2>
            
            {reviews.length === 0 ? (
              <p className="text-gray-500 italic mb-8">No reviews yet. Be the first to review after your stay!</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-10">
                {reviews.map((review, index) => (
                  <motion.div 
                    key={review.id} 
                    initial={{ y: 20, opacity: 0 }}
                    whileInView={{ y: 0, opacity: 1 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.4, delay: index * 0.1 }}
                    className="bg-gray-50 p-6 rounded-2xl border border-gray-100"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 bg-emerald-100 text-emerald-700 rounded-full flex items-center justify-center font-bold text-lg">
                        {review.guestName.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="font-bold text-gray-900">{review.guestName}</h4>
                        <div className="flex items-center gap-1">
                          {[...Array(5)].map((_, i) => (
                            <Star key={i} className={`w-3 h-3 ${i < review.rating ? 'fill-emerald-500 text-emerald-500' : 'text-gray-300'}`} />
                          ))}
                        </div>
                      </div>
                    </div>
                    <p className="text-gray-700 text-sm leading-relaxed">{review.comment}</p>
                    <p className="text-xs text-gray-400 mt-4">
                      {review.createdAt?.toDate ? review.createdAt.toDate().toLocaleDateString() : 'Just now'}
                    </p>
                  </motion.div>
                ))}
              </div>
            )}

            {/* Leave a Review Form */}
            <div className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm">
              <h3 className="text-lg font-bold text-gray-900 mb-4">Leave a Review</h3>
              {reviewSuccess ? (
                <div className="text-emerald-600 bg-emerald-50 p-4 rounded-lg flex items-center gap-2">
                  <Check className="w-5 h-5" /> Thank you for your review!
                </div>
              ) : (
                <form onSubmit={handleReviewSubmit} className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                      <input required type="text" value={reviewForm.guestName} onChange={e => setReviewForm({...reviewForm, guestName: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" placeholder="Type your name" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Rating</label>
                      <select value={reviewForm.rating} onChange={e => setReviewForm({...reviewForm, rating: Number(e.target.value)})} className="w-full border border-gray-300 rounded-lg p-2 bg-white">
                        <option value={5}>5 - Excellent</option>
                        <option value={4}>4 - Very Good</option>
                        <option value={3}>3 - Average</option>
                        <option value={2}>2 - Poor</option>
                        <option value={1}>1 - Terrible</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Review</label>
                    <textarea required rows={3} value={reviewForm.comment} onChange={e => setReviewForm({...reviewForm, comment: e.target.value})} className="w-full border border-gray-300 rounded-lg p-2" placeholder="Tell us about your stay..."></textarea>
                  </div>
                  <button type="submit" disabled={reviewSubmitting} className="bg-gray-900 text-white px-6 py-2 rounded-lg font-medium hover:bg-gray-800 disabled:bg-gray-400">
                    {reviewSubmitting ? 'Submitting...' : 'Submit Review'}
                  </button>
                </form>
              )}
            </div>
          </section>
        </motion.div>

        {/* Booking Sidebar */}
        <motion.div 
          initial={{ x: 20, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.6, delay: 0.4 }}
          className="lg:col-span-1"
        >
          <div className="bg-white border border-gray-200 rounded-2xl shadow-xl p-6 sticky top-24">
            <div className="flex justify-between items-end mb-6">
              <div>
                <span className="text-2xl font-bold text-gray-900">${listing.pricePerNight}</span>
                <span className="text-gray-500"> / night</span>
              </div>
            </div>

            {bookingSuccess ? (
              <motion.div 
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="bg-green-50 text-green-800 p-6 rounded-xl text-center"
              >
                <Check className="w-12 h-12 mx-auto mb-4 text-green-600" />
                <h3 className="text-lg font-bold mb-2">Booking Confirmed!</h3>
                <p className="text-sm mb-4">Your stay dates have been booked successfully</p>
                <p className="text-xs text-green-700 bg-green-100 p-2 rounded">Confirmation email sent to your inbox!</p>
                <button onClick={() => setBookingSuccess(false)} className="mt-6 text-emerald-600 font-medium hover:underline">Book another date</button>
              </motion.div>
            ) : (
              <form onSubmit={handleBooking} className="space-y-4">
                <div className="border border-gray-300 rounded-xl overflow-hidden">
                  <div className="p-4 border-b border-gray-300 bg-gray-50">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Select Dates</label>
                    <div className="flex justify-center">
                      <DayPicker
                        mode="range"
                        selected={dateRange}
                        onSelect={handleDateSelect}
                        disabled={[{ before: new Date() }, ...bookedDates]}
                        className="bg-white p-2 rounded-lg shadow-sm text-sm"
                      />
                    </div>
                  </div>
                  
                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Guests</label>
                    <input required type="number" min="1" max={listing.maxGuests} value={numberOfGuests} onChange={e => setNumberOfGuests(Number(e.target.value))} className="w-full border border-gray-300 rounded p-2 text-gray-900" />
                  </div>

                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Guest Name</label>
                    <input required type="text" value={guestName} onChange={e => setGuestName(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="Type your name" />
                  </div>
                  
                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Nationality</label>
                    <input required type="text" value={nationality} onChange={e => setNationality(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="e.g., Sri Lankan, American" />
                  </div>
                  
                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Email</label>
                    <input required type="email" value={guestEmail} onChange={e => setGuestEmail(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="ex@example.com" />
                  </div>

                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Phone (with country code)</label>
                    <input required type="tel" value={phoneNumber} onChange={e => setPhoneNumber(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="+1234567890" />
                  </div>

                  <div className="p-4 border-b border-gray-300">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Est. Check-in Time (Optional)</label>
                    <input type="text" value={checkInTime} onChange={e => setCheckInTime(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="e.g., 15:00" />
                  </div>

                  <div className="p-4">
                    <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">Special Requests (Optional)</label>
                    <textarea rows={2} value={specialRequests} onChange={e => setSpecialRequests(e.target.value)} className="w-full border border-gray-300 rounded p-2 text-gray-900 placeholder-gray-400" placeholder="Any special requirements?" />
                  </div>
                </div>

                {daysSelected > 0 && (
                  <div className="py-4 space-y-2">
                    <div className="flex justify-between text-gray-600">
                      <span>${listing.pricePerNight} x {daysSelected} nights</span>
                      <span className={discount > 0 ? "line-through text-gray-400" : ""}>${daysSelected * listing.pricePerNight}</span>
                    </div>
                    
                    {discount > 0 && (
                      <div className="flex justify-between text-emerald-600 font-medium bg-emerald-50 p-2 rounded">
                        <span>{appliedRate} Discount</span>
                        <span>-${discount.toFixed(2)}</span>
                      </div>
                    )}
                    
                    <div className="flex justify-between font-bold text-xl pt-4 border-t border-gray-200">
                      <span>Total</span>
                      <span>${totalPrice.toFixed(2)}</span>
                    </div>
                  </div>
                )}

                <button 
                  type="submit" 
                  disabled={bookingLoading || !dateRange?.from || !dateRange?.to}
                  className="w-full bg-emerald-600 text-white py-4 rounded-xl font-bold text-lg hover:bg-emerald-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-lg transform hover:-translate-y-1 active:translate-y-0"
                >
                  {bookingLoading ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Processing...</>
                  ) : (
                    'Instantly Book'
                  )}
                </button>
                
                <div className="text-center text-xs text-gray-500 mt-4 space-y-1">
                  <p>You won't be charged yet.</p>
                  <p className="flex items-center justify-center gap-1"><Check className="w-3 h-3 text-emerald-500" /> Availability verified with Airbnb & Booking.com</p>
                </div>
              </form>
            )}
          </div>
        </motion.div>
      </div>
    </motion.div>
  );
}

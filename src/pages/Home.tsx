import React, { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import { Listing } from '../types';
import { Link } from 'react-router-dom';
import { MapPin, Users, Star, Send } from 'lucide-react';
import { handleFirestoreError, OperationType } from '../utils/errorHandling';
import { motion } from 'motion/react';
import { Helmet } from 'react-helmet-async';

export default function Home() {
  const [listings, setListings] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);

  // Contact form state
  const [contactForm, setContactForm] = useState({ name: '', phone: '', email: '', nationality: '', subject: '', message: '' });
  const [contactStatus, setContactStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      try {
        setError(null);
        const q = query(collection(db, 'listings'), orderBy('createdAt', 'desc'));
        const querySnapshot = await getDocs(q);
        const fetchedListings = querySnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        })) as Listing[];
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

    fetchListings();
  }, []);

  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\+[1-9]\d{1,14}$/.test(contactForm.phone.replace(/\s+/g, ''))) {
      setError('Please enter a valid phone number with a country code (e.g., +1234567890).');
      return;
    }
    setContactStatus('submitting');
    try {
      setError(null);
      await addDoc(collection(db, 'contactMessages'), {
        ...contactForm,
        createdAt: serverTimestamp()
      });

      // Send email to owner
      const ownerEmailHtml = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; line-height: 1.6;">
          <h2 style="color: #059669; border-bottom: 2px solid #059669; padding-bottom: 10px;">New Contact Form Submission</h2>
          <p>You have received a new message from the contact form on your website.</p>
          
          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <h3 style="margin-top: 0; color: #111827;">Visitor Details</h3>
            <p style="margin: 5px 0;"><strong>Name:</strong> ${contactForm.name}</p>
            <p style="margin: 5px 0;"><strong>Email:</strong> <a href="mailto:${contactForm.email}">${contactForm.email}</a></p>
            <p style="margin: 5px 0;"><strong>Phone:</strong> ${contactForm.phone}</p>
            <p style="margin: 5px 0;"><strong>Nationality:</strong> ${contactForm.nationality}</p>
          </div>

          <div style="background-color: #f9fafb; padding: 20px; border-radius: 8px; margin: 20px 0; border: 1px solid #e5e7eb;">
            <h3 style="margin-top: 0; color: #111827;">Message</h3>
            <p style="margin: 5px 0;"><strong>Subject:</strong> ${contactForm.subject}</p>
            <p style="margin: 15px 0 5px 0;"><strong>Message:</strong></p>
            <div style="background-color: #ffffff; padding: 15px; border: 1px solid #d1d5db; border-radius: 4px; white-space: pre-wrap;">${contactForm.message}</div>
          </div>
        </div>
      `;

      await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: [import.meta.env.VITE_OWNER_EMAIL, 'dehipitiya@gmail.com'], // Sending to the owner
          subject: `Contact Form: ${contactForm.subject} - ${contactForm.name}`,
          html: ownerEmailHtml
        })
      });

      setContactStatus('success');
      setContactForm({ name: '', phone: '', email: '', nationality: '', subject: '', message: '' });
      setTimeout(() => setContactStatus('idle'), 5000);
    } catch (err) {
      console.error("Error sending message:", err);
      setContactStatus('error');
      try {
        handleFirestoreError(err, OperationType.CREATE, 'contactMessages');
      } catch (e: any) {
        const parsed = JSON.parse(e.message);
        setError(parsed.error || 'Failed to send message');
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.5 }}
      className="min-h-screen bg-gray-50 flex flex-col"
    >
        <Helmet>
        <title>Naturus Homes | Premium Accommodations in Sri Lanka</title>
        <meta name="description" content="Book serene and exceptional accommodations across Sri Lanka. Experience the true warmth of Sri Lankan hospitality with Naturus Homes." />
        <meta name="keywords" content="Sri Lanka accommodations, Naturus Homes, vacation rentals, book direct, Sri Lanka travel, premium apartments" />
        <meta property="og:title" content="Naturus Homes | Premium Accommodations in Sri Lanka" />
        <meta property="og:description" content="Book serene and exceptional accommodations across Sri Lanka. Experience the true warmth of Sri Lankan hospitality with Naturus Homes." />
        <meta property="og:image" content="https://naturushomes.com/favicon.svg" />
        <meta property="og:url" content="https://naturushomes.com/" />
        <meta property="og:type" content="website" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Naturus Homes | Premium Accommodations in Sri Lanka" />
        <meta name="twitter:description" content="Book serene and exceptional accommodations across Sri Lanka. Experience the true warmth of Sri Lankan hospitality with Naturus Homes." />
        <meta name="twitter:image" content="https://naturushomes.com/favicon.svg" />
        <script type="application/ld+json">
          {`
            {
              "@context": "https://schema.org",
              "@graph": [
                {
                  "@type": "WebSite",
                  "name": "Naturus Homes",
                  "url": "https://naturushomes.com",
                  "description": "A premier booking website for serene accommodations in different locations across Sri Lanka."
                },
                {
                  "@type": "ItemList",
                  "itemListElement": [
                    ${listings.map((listing, index) => `
                      {
                        "@type": "ListItem",
                        "position": ${index + 1},
                        "url": "https://naturushomes.com/listing/${listing.nickname || listing.id}"
                      }
                    `).join(',')}
                  ]
                }
              ]
            }
          `}
        </script>
      </Helmet>

      {error && (
        <div className="bg-red-50 border-l-4 border-red-500 p-4 relative z-50">
          <div className="flex justify-between items-start max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div>
              <h3 className="text-red-800 font-medium">Error</h3>
              <p className="text-red-700 text-sm mt-1">{error}</p>
            </div>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              <span className="sr-only">Dismiss</span>
              <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        </div>
      )}

      {/* Hero Section */}
      <div className="relative bg-emerald-900 text-white py-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
        <motion.div 
          initial={{ scale: 1.1 }}
          animate={{ scale: 1 }}
          transition={{ duration: 1.5, ease: "easeOut" }}
          className="absolute inset-0 overflow-hidden"
        >
          <img
            src="https://images.unsplash.com/photo-1552055568-f8c4fb8c6320?q=80&w=1974&auto=format&fit=crop&ixlib=rb-4.1.0&ixid=M3wxMjA3fDB8MHxwaG90by1wYWdlfHx8fGVufDB8fHx8fA%3D%3D"
            alt="Sri Lanka"
            className="w-full h-full object-cover opacity-30"
            referrerPolicy="no-referrer"
          />
        </motion.div>
        <div className="relative max-w-7xl mx-auto text-center">
          <motion.h1 
            initial={{ y: 30, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2, duration: 0.8 }}
            className="text-5xl md:text-7xl font-extrabold tracking-tight mb-4"
          >
            NATURUS
          </motion.h1>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.4, duration: 0.8 }}
            className="text-sm md:text-base uppercase tracking-[0.3em] text-emerald-300 font-semibold mb-8"
          >
            Homes
          </motion.p>
          <motion.p 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.6, duration: 0.8 }}
            className="text-xl md:text-2xl max-w-3xl mx-auto font-light text-emerald-100"
          >
            Experience the true warmth of Sri Lankan hospitality in beautiful locations across the island.
          </motion.p>
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.8, duration: 0.8 }}
            className="mt-10"
          >
            <a href="/#listings" className="bg-white text-emerald-900 px-8 py-3 rounded-full font-semibold hover:bg-emerald-50 transition-colors inline-block hover:scale-105 transform duration-300">
              View Properties
            </a>
          </motion.div>
        </div>
      </div>

      {/* About Naturus Homes */}
      <section id="about" className="py-16 bg-white overflow-hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
            <motion.div
              initial={{ x: -50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
            >
              <h2 className="text-3xl font-bold text-gray-900 mb-6">Your Host, Naturus Homes</h2>
              <p className="text-gray-600 mb-4 leading-relaxed">
                With extensive experience in the tourism industry, we are passionate about providing peaceful and exceptional stays for travelers visiting Sri Lanka. As a dedicated accommodation provider, our goal is to ensure you find your perfect serene escape.
              </p>
              <p className="text-gray-600 mb-6 leading-relaxed">
                We manage premium, tranquil properties in different locations across Sri Lanka, carefully curated to offer comfort, serenity, and a touch of local charm.
              </p>
              <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-6 hover:shadow-md transition-shadow">
                <h3 className="flex items-center gap-2 text-emerald-800 font-bold text-lg mb-2">
                  <Star className="w-5 h-5 fill-emerald-500 text-emerald-500" />
                  Book Direct & Save
                </h3>
                <p className="text-emerald-700">
                  Why pay more on platforms like Booking.com or Airbnb? By booking directly through this website, you avoid platform fees and get the absolute best price guaranteed, along with a <strong>$0 cancellation fee</strong>!
                </p>
              </div>
            </motion.div>
            <motion.div 
              initial={{ x: 50, opacity: 0 }}
              whileInView={{ x: 0, opacity: 1 }}
              viewport={{ once: true, margin: "-100px" }}
              transition={{ duration: 0.8 }}
              className="relative h-96 rounded-2xl overflow-hidden shadow-xl"
            >
              <img
                src="https://a0.muscache.com/im/pictures/hosting/Hosting-U3RheVN1cHBseUxpc3Rpbmc6MTQ5NzUwOTgyMzA5Mjc2ODQ3Nw==/original/b96584c5-e268-481d-aa47-c4ba2bc52a5c.jpeg?im_w=1440"
                alt="Naturus Homes Property"
                className="absolute inset-0 w-full h-full object-cover hover:scale-105 transition-transform duration-700"
                referrerPolicy="no-referrer"
              />
            </motion.div>
          </div>
        </div>
      </section>

      {/* Listings */}
      <section id="listings" className="py-16 bg-gray-50 flex-grow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl font-bold text-gray-900 mb-10 text-center">Our Properties</h2>
          
          {loading ? (
            <div className="flex justify-center py-20">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-emerald-600"></div>
            </div>
          ) : listings.length === 0 ? (
            <div className="text-center py-20 text-gray-500">
              No properties available at the moment. Please check back later.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {listings.map((listing, index) => (
                <motion.div
                  key={listing.id}
                  initial={{ y: 30, opacity: 0 }}
                  whileInView={{ y: 0, opacity: 1 }}
                  viewport={{ once: true, margin: "-50px" }}
                  transition={{ duration: 0.5, delay: index * 0.1 }}
                >
                  <Link to={`/listing/${listing.nickname || listing.id}`} className="bg-white rounded-2xl shadow-sm hover:shadow-xl transition-all duration-300 overflow-hidden group border border-gray-100 flex flex-col h-full">
                    <div className="relative h-64 overflow-hidden shrink-0">
                      <img
                        src={listing.photos?.[0] || 'https://picsum.photos/seed/serene/800/600'}
                        alt={listing.title}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700"
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-4 right-4 bg-white/90 backdrop-blur-sm px-3 py-1 rounded-full text-sm font-bold text-emerald-700 shadow-sm">
                        ${listing.pricePerNight} USD / night
                      </div>
                    </div>
                    <div className="p-6 flex flex-col flex-grow">
                      <h3 className="text-xl font-bold text-gray-900 mb-2 line-clamp-1 group-hover:text-emerald-700 transition-colors">{listing.title}</h3>
                      <p className="text-gray-500 text-sm mb-4 line-clamp-2 flex-grow">{listing.description}</p>
                      
                      <div className="flex flex-col gap-2 text-sm text-gray-600 mt-auto">
                        <div className="flex items-center gap-2">
                          <MapPin className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span className="line-clamp-1">{listing.location}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Users className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>Up to {listing.maxGuests} guests</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Contact Us Section */}
      <section id="contact" className="py-16 bg-white">
        <motion.div 
          initial={{ y: 40, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true, margin: "-100px" }}
          transition={{ duration: 0.7 }}
          className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8"
        >
          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-900 mb-4">Contact Us</h2>
            <p className="text-gray-600">Have a question or need assistance? Send us a message and we'll get back to you shortly.</p>
          </div>

          <div className="bg-gray-50 rounded-2xl p-8 border border-gray-100 shadow-lg hover:shadow-xl transition-shadow duration-300">
            {contactStatus === 'success' ? (
              <motion.div 
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Send className="w-8 h-8" />
                </div>
                <h3 className="text-2xl font-bold text-gray-900 mb-2">Message Sent!</h3>
                <p className="text-gray-600">Thank you for reaching out. We will contact you soon.</p>
              </motion.div>
            ) : (
              <form onSubmit={handleContactSubmit} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Your Name</label>
                    <input required type="text" value={contactForm.name} onChange={e => setContactForm({...contactForm, name: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="Type your name" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp Number</label>
                    <input required type="tel" value={contactForm.phone} onChange={e => setContactForm({...contactForm, phone: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="+1 23 456 7890" />
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Nationality</label>
                    <input required type="text" value={contactForm.nationality} onChange={e => setContactForm({...contactForm, nationality: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="e.g., Sri Lankan, American" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">Email Address</label>
                    <input required type="email" value={contactForm.email} onChange={e => setContactForm({...contactForm, email: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="ex@example.com" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                  <input required type="text" value={contactForm.subject} onChange={e => setContactForm({...contactForm, subject: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="Inquiry about booking" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Message</label>
                  <textarea required rows={5} value={contactForm.message} onChange={e => setContactForm({...contactForm, message: e.target.value})} className="w-full border border-gray-300 rounded-lg p-3 focus:ring-emerald-500 focus:border-emerald-500" placeholder="How can we help you?"></textarea>
                </div>
                <button 
                  type="submit" 
                  disabled={contactStatus === 'submitting'}
                  className="w-full bg-emerald-600 text-white py-3 rounded-xl font-bold text-lg hover:bg-emerald-700 disabled:bg-gray-400 transition-all duration-300 flex items-center justify-center gap-2 hover:shadow-lg transform hover:-translate-y-1 active:translate-y-0"
                >
                  {contactStatus === 'submitting' ? 'Sending...' : <><Send className="w-5 h-5" /> Send Message</>}
                </button>
              </form>
            )}
          </div>
        </motion.div>
      </section>
    </motion.div>
  );
}

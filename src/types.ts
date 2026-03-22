export interface PhotoCategory {
  category: string;
  urls: string[];
}

export interface Listing {
  id: string;
  title: string;
  description: string;
  location: string;
  pricePerNight: number;
  pricePerWeek?: number;
  pricePerMonth?: number;
  maxGuests: number;
  floorArea?: number;
  bedrooms?: number;
  bathrooms?: number;
  checkInTime?: string;
  checkOutTime?: string;
  amenities?: string[];
  houseRules?: string;
  photos?: string[];
  categorizedPhotos?: PhotoCategory[];
  airbnbUrl?: string;
  bookingComUrl?: string;
  icalUrls?: string[];
  createdAt: any;
  updatedAt?: any;
}

export interface Booking {
  id: string;
  listingId: string;
  guestName: string;
  guestEmail: string;
  phoneNumber: string;
  numberOfGuests: number;
  checkInTime?: string;
  specialRequests?: string;
  startDate: any;
  endDate: any;
  status: 'pending' | 'confirmed' | 'cancelled';
  totalPrice: number;
  createdAt: any;
}

export interface Review {
  id: string;
  listingId: string;
  guestName: string;
  rating: number;
  comment: string;
  createdAt: any;
}

export interface ContactMessage {
  id: string;
  name: string;
  phone: string;
  email: string;
  subject: string;
  message: string;
  createdAt: any;
}

import { Building2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Footer() {
  return (
    <motion.footer 
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.8 }}
      className="bg-gray-900 text-gray-300 py-12 mt-auto"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-emerald-700 text-white p-2 rounded-lg">
                <Building2 className="w-6 h-6" strokeWidth={1.5} />
              </div>
              <div className="flex flex-col justify-center">
                <span className="text-xl font-bold text-white tracking-tight leading-none mb-1">
                  WESTSHORE
                </span>
                <span className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-500 font-semibold leading-none">
                  Stays
                </span>
              </div>
            </div>
            <p className="text-sm">
              Providing exceptional hospitality and comfortable stays in the Western Province, Sri Lanka.
            </p>
          </div>
          <div>
            <h3 className="text-white text-lg font-bold mb-4">Quick Links</h3>
            <ul className="space-y-2 text-sm">
              <li><a href="/" className="hover:text-emerald-400 transition-colors">Home</a></li>
              <li><a href="/#listings" className="hover:text-emerald-400 transition-colors">Properties</a></li>
              <li><a href="/#about" className="hover:text-emerald-400 transition-colors">About Westshore Stays</a></li>
            </ul>
          </div>
          <div>
            <h3 className="text-white text-lg font-bold mb-4">Contact</h3>
            <p className="text-sm hover:text-emerald-400 transition-colors cursor-pointer">+94 71 8256 817 (WhatsApp)</p>
            <p className="text-sm hover:text-emerald-400 transition-colors cursor-pointer">dehipitiya@gmail.com</p>
            <p className="text-sm mt-2 text-emerald-500 font-medium">Book directly with us for the best rates!</p>
          </div>
        </div>
        <div className="border-t border-gray-800 mt-8 pt-8 text-center text-sm">
          <p>&copy; {new Date().getFullYear()} Westshore Stays. All rights reserved.</p>
        </div>
      </div>
    </motion.footer>
  );
}

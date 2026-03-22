import { Link } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { motion } from 'motion/react';

export default function Navbar() {
  return (
    <motion.nav 
      initial={{ y: -100 }}
      animate={{ y: 0 }}
      transition={{ duration: 0.5, ease: "easeOut" }}
      className="bg-white shadow-sm sticky top-0 z-50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between h-20">
          <div className="flex items-center">
            <Link to="/" className="flex items-center gap-3 group">
              <motion.div 
                whileHover={{ scale: 1.05, rotate: 5 }}
                whileTap={{ scale: 0.95 }}
                className="bg-emerald-700 text-white p-2 rounded-lg group-hover:bg-emerald-800 transition-colors"
              >
                <Building2 className="w-6 h-6" strokeWidth={1.5} />
              </motion.div>
              <div className="flex flex-col justify-center">
                <span className="text-xl font-bold text-gray-900 tracking-tight leading-none mb-1">
                  WESTSHORE
                </span>
                <span className="text-[0.65rem] uppercase tracking-[0.2em] text-emerald-700 font-semibold leading-none">
                  Stays
                </span>
              </div>
            </Link>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}

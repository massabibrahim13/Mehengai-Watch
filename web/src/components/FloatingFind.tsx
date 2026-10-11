// A round search button in the corner, shown once the visitor has scrolled past the hero.
// Its "Find a price" label slides out on hover or keyboard focus.
import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export function FloatingFind({ show, onSearch }: { show: boolean; onSearch: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button type="button" onClick={onSearch} aria-label="Find a price"
          initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.6 }}
          className="group fixed bottom-5 right-5 z-30 flex h-14 items-center rounded-full bg-brand pl-[18px] pr-[18px] text-on-brand shadow-[0_16px_36px_-12px_var(--color-brand)] ring-4 ring-bg transition-[padding] duration-300 hover:pr-6 focus-visible:pr-6">
          <Search size={20} aria-hidden="true" />
          <span className="max-w-0 overflow-hidden whitespace-nowrap font-bold opacity-0 transition-all duration-300 group-hover:ml-2 group-hover:max-w-32 group-hover:opacity-100 group-focus-visible:ml-2 group-focus-visible:max-w-32 group-focus-visible:opacity-100">
            Find a price
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

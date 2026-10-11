// A floating "Find a price" button in the corner, shown once the visitor has scrolled past the hero.
import { Search } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";

export function FloatingFind({ show, onSearch }: { show: boolean; onSearch: () => void }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.button type="button" onClick={onSearch}
          initial={{ opacity: 0, y: 20, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-3 rounded-2xl bg-ink py-2 pl-5 pr-2 font-bold text-panel shadow-[0_18px_40px_-14px_rgb(0_0_0/0.5)] transition-transform hover:-translate-y-0.5">
          Find a price
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[linear-gradient(135deg,var(--color-brand),var(--color-brand-2))] text-on-brand">
            <Search size={18} aria-hidden="true" />
          </span>
        </motion.button>
      )}
    </AnimatePresence>
  );
}

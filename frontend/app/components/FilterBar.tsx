"use client";

interface Location {
  id: number;
  name: string;
  type: string;
}

interface Category {
  id: number;
  name: string;
}

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  category: string;
  onCategoryChange: (v: string) => void;
  categories: Category[];
  location?: string;
  onLocationChange?: (v: string) => void;
  locations?: Location[];
  showLocation?: boolean;
}

export default function FilterBar({
  search,
  onSearchChange,
  category,
  onCategoryChange,
  categories,
  location,
  onLocationChange,
  locations,
  showLocation,
}: FilterBarProps) {
  return (
    <div>
      <div className="my-2">
        <label className="flex-1 block text-[10px] sm:text-xs font-medium text-gray-500 mb-0.5 sm:mb-1">
          Search
        </label>
        <input
          placeholder="Search products..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="border p-1.5 sm:p-2 rounded-lg w-full text-xs sm:text-sm"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5 sm:gap-3 items-end">
        <div>
          <label className="mb-1 block text-[10px] sm:text-xs font-medium text-gray-500 mb-0.5 sm:mb-1">
            Category
          </label>
          <select
            value={category}
            onChange={(e) => onCategoryChange(e.target.value)}
            className="border p-1.5 sm:p-2 rounded-lg bg-white text-xs sm:text-sm w-full"
          >
            <option value="">All Categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>

        {showLocation && onLocationChange && locations && (
          <div>
            <label className="block text-[10px] sm:text-xs font-medium text-gray-500 mb-0.5 sm:mb-1">
              Location
            </label>
            <select
              value={location}
              onChange={(e) => onLocationChange(e.target.value)}
              className="border p-1.5 sm:p-2 rounded-lg bg-white text-xs sm:text-sm w-full"
            >
              <option value="">All Locations</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
    </div>
  );
}

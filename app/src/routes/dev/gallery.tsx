import { createFileRoute } from "@tanstack/react-router"
import { gallerySearch } from "@/app/gallery/gallery-search"
import { GalleryPage } from "@/app/gallery/gallery-page"
import { RouteNotFound } from "@/components/errors/route-not-found"

// Dev only (routing-auth §2.3): production builds render not-found and drop the gallery code.
export const Route = createFileRoute("/dev/gallery")({
  validateSearch: gallerySearch,
  component: import.meta.env.DEV ? Gallery : RouteNotFound,
})

function Gallery() {
  const search = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <GalleryPage
      search={search}
      onSearchChange={(patch) =>
        void navigate({
          search: (prev) => ({ ...prev, ...patch }),
          replace: true,
        })
      }
    />
  )
}

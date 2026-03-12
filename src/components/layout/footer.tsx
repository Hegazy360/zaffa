import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t bg-muted/30">
      <div className="container mx-auto max-w-7xl px-4 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div>
            <h3 className="text-lg font-bold bg-gradient-to-r from-rose-600 to-amber-500 bg-clip-text text-transparent">
              Zaffa
            </h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Your dream event, expertly planned. Connecting you with
              Egypt&apos;s finest wedding planners and vendors.
            </p>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Explore</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/explore" className="hover:text-foreground">
                  Browse Arrangements
                </Link>
              </li>
              <li>
                <Link href="/planners" className="hover:text-foreground">
                  Find Planners
                </Link>
              </li>
              <li>
                <Link href="/vendors" className="hover:text-foreground">
                  Vendor Directory
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3">AI Tools</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/ai/style-quiz" className="hover:text-foreground">
                  Style Quiz
                </Link>
              </li>
              <li>
                <Link href="/ai/mood-board" className="hover:text-foreground">
                  Mood Board Generator
                </Link>
              </li>
            </ul>
          </div>

          <div>
            <h4 className="font-semibold mb-3">Company</h4>
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>
                <Link href="/about" className="hover:text-foreground">
                  About
                </Link>
              </li>
              <li>
                <Link href="/contact" className="hover:text-foreground">
                  Contact
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="hover:text-foreground">
                  Privacy Policy
                </Link>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-8 pt-8 border-t text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} Zaffa. All rights reserved.
        </div>
      </div>
    </footer>
  );
}

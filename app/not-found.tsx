import Link from "next/link";

export default function NotFound() {
    return (
        <div className="flex min-h-screen flex-col items-center justify-center p-6 text-center">
            <div className="glass glass-edge rounded-[32px] p-12 max-w-md w-full">
                <h2 className="text-4xl font-bold mb-4 font-mono">404</h2>
                <h3 className="text-xl font-semibold mb-2">Page Not Found</h3>
                <p className="text-sm opacity-70 mb-8">
                    The page you are looking for does not exist or has been moved.
                </p>
                <Link
                    href="/"
                    className="inline-flex h-12 items-center justify-center px-8 rounded-full bg-[color:var(--color-accent)] font-semibold text-white transition-opacity hover:opacity-90"
                >
                    Return Home
                </Link>
            </div>
        </div>
    );
}

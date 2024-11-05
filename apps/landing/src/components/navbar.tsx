"use client";

import { motion } from "framer-motion";
import { Menu, X } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";

import { Button } from "@memoize/ui/button";
import useDeviceType from "~/hooks/use-device";

export default function NavBar() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isScrolled, setIsScrolled] = useState(false);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const device = useDeviceType();
  const isMobile = device === "mobile";

  useEffect(() => {
    const handleScroll = () => {
      const scrollPosition = window.scrollY;
      setIsScrolled(scrollPosition > 400); // Change 100 to adjust when the navbar should shrink
    };

    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (mobileMenuRef.current) {
      if (isMobileMenuOpen) {
        mobileMenuRef.current.style.maxHeight = `${mobileMenuRef.current.scrollHeight}px`;
      } else {
        mobileMenuRef.current.style.maxHeight = "0";
      }
    }
  }, [isMobileMenuOpen]);

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <motion.nav
      // biome-ignore lint/style/noUnusedTemplateLiteral: <explanation>
      className={`fixed top-0 sm:top-3 z-[90]  left-1/2 -translate-x-1/2 max-w-screen-2xl   rounded-md border bg-background/90 py-3 backdrop-blur-[10px] `}
      animate={{
        width: isScrolled && !isMobile ? "70%" : "100%",
        transition: {
          duration: 0.3,
          type: "spring",
          stiffness: 100,
          damping: 20,
        },
      }}
    >
      <div className="container">
        <div className="flex items-center justify-between">
          <Link href="/" className="text-2xl font-bold text-primary">
            <Image src="/logo.png" alt="Memoize" width={40} height={40} />
          </Link>

          <div className="hidden space-x-8 md:flex">
            <Link
              href="#how-it-works"
              className="text-gray-600 hover:text-primary"
            >
              How it works
            </Link>
            <Link
              href="#solutions"
              className="text-gray-600 hover:text-primary"
            >
              Solutions
            </Link>

            {/* <Link href="" className="text-gray-600 hover:text-primary">
              Pricing
            </Link> */}
          </div>

          <div className="hidden md:block ">
            {/* <Button>Login</Button> */}
            <button
              type="button"
              style={{
                overflow: "hidden",
              }}
              className="group relative  rounded-md bg-primary px-6 py-3  text-sm font-semibold text-white"
            >
              <Link
                href="https://app.memoize.com/sign-up"
                // onClick={() => {
                //   posthog.capture("sign_up_button_clicked", {
                //     property: "from navbar desktop",
                //   });
                // }}
                className="h-full w-full px-6 py-3"
              >
                <span className="relative z-10 transition-opacity duration-300 group-hover:opacity-0">
                  Self Reflect
                </span>
                <span className="absolute inset-0 z-10 flex items-center justify-center text-indigo-300 opacity-0 transition-opacity duration-500  group-hover:opacity-100">
                  Get Started
                </span>
                <div className="absolute inset-0 -translate-y-full transform bg-black transition-transform duration-500 ease-in-out group-hover:h-[150%] group-hover:translate-y-0 group-hover:rounded-b-[100%]" />
              </Link>
            </button>
          </div>

          <div className="md:hidden">
            <Button variant="ghost" size="icon" onClick={toggleMobileMenu}>
              {isMobileMenuOpen ? (
                <X className="h-6 w-6" />
              ) : (
                <Menu className="h-6 w-6" />
              )}
            </Button>
          </div>
        </div>

        <div
          ref={mobileMenuRef}
          className="overflow-hidden transition-all duration-500 ease-in-out md:hidden"
          style={{ maxHeight: 0 }}
        >
          <div className="space-y-4 py-4">
            <Link
              href="#how-it-works"
              className="block text-gray-600 hover:text-primary"
            >
              How it works
            </Link>
            <Link
              href="#solutions"
              className="block text-gray-600 hover:text-primary"
            >
              Solutions
            </Link>
            <Link
              href="#pricing"
              className="block text-gray-600 hover:text-primary"
            >
              Pricing
            </Link>
            <Button asChild className="w-full">
              <Link
                href="https://app.memoize.com/sign-up"
                // onClick={() => {
                //   posthog.capture("sign_up_button_clicked", {
                //     property: "from navbar mobile",
                //   });
                // }}
              >
                Get Started
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </motion.nav>
  );
}

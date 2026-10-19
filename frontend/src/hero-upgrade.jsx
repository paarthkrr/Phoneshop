import React, { useState, useEffect, useRef } from "react";

// HD Hero with smooth scroll animations
export default function HeroUpgrade({ quoteModels = [] }) {
  const [scrollY, setScrollY] = useState(0);
  const heroRef = useRef(null);

  useEffect(() => {
    const onScroll = () => setScrollY(window.scrollY);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const parallax = Math.min(scrollY * 0.3, 100);
  const opacity = Math.max(1 - scrollY / 600, 0);

  return (
    <section ref={heroRef} style={{
      position: "relative",
      minHeight: "100vh",
      background: "linear-gradient(160deg, #1a0a0f 0%, #0d0608 50%, #050304 100%)",
      display: "flex",
      alignItems: "center",
      overflow: "hidden",
    }}>
      {/* Glow effect */}
      <div style={{
        position: "absolute",
        top: "20%",
        right: "10%",
        width: 600,
        height: 600,
        background: "radial-gradient(circle, rgba(122,31,43,0.3) 0%, transparent 70%)",
        filter: "blur(60px)",
        transform: `translateY(${parallax}px)`,
      }} />

      <div style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "60px 24px",
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 60,
        alignItems: "center",
        position: "relative",
        zIndex: 1,
        opacity,
      }}>
        {/* Left content */}
        <div>
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 8,
            padding: "6px 14px",
            background: "rgba(122,31,43,0.2)",
            borderRadius: 20,
            fontSize: 12,
            fontWeight: 600,
            color: "#C4A35A",
            letterSpacing: 1,
            marginBottom: 20,
          }}>
            SYDNEY · SELL · REPAIR · BUY
          </div>
          
          <h1 style={{
            fontSize: "clamp(36px, 5vw, 56px)",
            fontWeight: 700,
            color: "#fff",
            lineHeight: 1.1,
            margin: "0 0 20px",
          }}>
            Sell your phone.<br />
            <span style={{ color: "#C4A35A" }}>Get paid today.</span>
          </h1>
          
          <p style={{
            fontSize: 18,
            color: "rgba(255,255,255,0.7)",
            lineHeight: 1.6,
            marginBottom: 32,
            maxWidth: 480,
          }}>
            We collect from your door anywhere in Sydney. Cash in hand, same day.
          </p>

          <div style={{ display: "flex", gap: 12, marginBottom: 32 }}>
            <a href="/quote" style={{
              padding: "16px 28px",
              background: "#7A1F2B",
              color: "#fff",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 600,
              fontSize: 16,
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
            }}>
              Sell my phone →
            </a>
            <a href="/shop" style={{
              padding: "16px 28px",
              background: "transparent",
              color: "#fff",
              border: "1px solid rgba(255,255,255,0.3)",
              borderRadius: 12,
              textDecoration: "none",
              fontWeight: 500,
              fontSize: 16,
            }}>
              Shop phones
            </a>
          </div>

          <div style={{ display: "flex", gap: 24, fontSize: 14, color: "rgba(255,255,255,0.6)" }}>
            <span>✓ Home collection</span>
            <span>✓ Paid in cash</span>
            <span>✓ 49-point check</span>
          </div>
        </div>

        {/* Right: Phone visual */}
        <div style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          position: "relative",
        }}>
          <div style={{
            width: 280,
            height: 560,
            background: "linear-gradient(145deg, #3d1a24 0%, #1a0a0f 100%)",
            borderRadius: 40,
            boxShadow: "0 40px 80px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.1)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            transform: `translateY(${-parallax * 0.5}px) rotateY(${scrollY * 0.02}deg)`,
            transition: "transform 0.1s ease-out",
          }}>
            <div style={{
              width: 240,
              height: 500,
              background: "linear-gradient(180deg, #2a1520 0%, #150a0d 100%)",
              borderRadius: 30,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              justifyContent: "center",
              color: "#fff",
              fontSize: 14,
            }}>
              <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
              <div style={{ fontWeight: 600 }}>iPhone 16 Pro</div>
              <div style={{ color: "#C4A35A", marginTop: 8 }}>Up to $1,450</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

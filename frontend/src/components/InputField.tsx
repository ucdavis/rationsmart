"use client";

import React from "react";

interface InputFieldProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  containerClassName?: string;
}

export default function InputField({
  label,
  containerClassName = "",
  className = "",
  ...props
}: InputFieldProps) {
  return (
    <div className={`px-3 ${containerClassName}`}>
      {label && (
        <p
          className="text-xs font-bold uppercase tracking-wide mt-3 mb-1.5 ml-1"
          style={{ color: "#6D6D6D", fontFamily: "Nunito, sans-serif" }}
        >
          {label}
        </p>
      )}
      <input
        className={`w-full rounded-2xl px-4 py-3.5 text-base border-none focus:ring-2 focus:ring-primary-dark focus:outline-none ${className}`}
        style={{
          backgroundColor: "#F1F5F9",
          color: "#231F20",
          fontFamily: "Nunito, sans-serif",
        }}
        {...props}
      />
    </div>
  );
}

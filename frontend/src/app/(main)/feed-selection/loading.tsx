export default function Loading() {
  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ backgroundColor: "#F8FAF9" }}
    >
      <div
        className="w-10 h-10 rounded-full animate-spin"
        style={{
          border: "3px solid #F0FDF4",
          borderTopColor: "#064E3B",
        }}
      />
    </div>
  );
}

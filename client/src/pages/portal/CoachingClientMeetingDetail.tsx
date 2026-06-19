import { useEffect } from "react";
import { useLocation } from "wouter";

export default function CoachingClientMeetingDetail() {
  const [, navigate] = useLocation();

  useEffect(() => {
    navigate("/portal/coaching/client-meeting");
  }, [navigate]);

  return (
    <div className="p-6 text-sm text-zinc-400">Redirecting to Client Meeting workspace...</div>
  );
}

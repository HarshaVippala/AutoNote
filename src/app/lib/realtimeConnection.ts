import { RefObject } from "react";

export async function createRealtimeConnection(
  EPHEMERAL_KEY: string,
  audioElement: RefObject<HTMLAudioElement | null>
): Promise<{ pc: RTCPeerConnection; dc: RTCDataChannel; audioTrack: MediaStreamTrack }> {
  const pc = new RTCPeerConnection();

  pc.ontrack = (e) => {
    if (audioElement.current) {
        audioElement.current.srcObject = e.streams[0];
    }
  };

  let ms: MediaStream;
  try {
    ms = await navigator.mediaDevices.getUserMedia({ audio: true });
    if (!ms) {
      throw new Error("getUserMedia returned null or undefined stream");
    }
    console.log("getUserMedia successful:", ms);
  } catch (err: any) {
    // More specific error logging
    if (err.name === 'NotAllowedError') {
        console.error("Error getting user media: Permission denied.", err);
        throw new Error(`Failed to get user media: Permission denied. Please check browser/system microphone permissions.`);
    } else if (err.name === 'NotFoundError') {
        console.error("Error getting user media: No microphone found.", err);
        throw new Error(`Failed to get user media: No microphone device found. Please ensure a microphone is connected and enabled.`);
    } else if (err.name === 'NotReadableError') {
        console.error("Error getting user media: Hardware error.", err);
        throw new Error(`Failed to get user media: Could not access microphone due to a hardware error.`);
    } else {
        console.error("Error getting user media:", err.name, err.message, err);
        throw new Error(`Failed to get user media: ${err.message}`); // Re-throw original message for other errors
    }
  }

  const audioTrack = ms.getTracks()[0];
  if (!audioTrack) {
      console.error("No audio track found in the media stream.");
      ms.getTracks().forEach(track => track.stop()); // Clean up the stream
      throw new Error("No audio track found in the media stream.");
  }
  console.log("Audio track obtained:", audioTrack);

  try {
      pc.addTrack(audioTrack, ms); // Pass the stream as the second argument as well
      console.log("Audio track added successfully to PeerConnection.");
  } catch (err: any) {
      console.error("Error adding track to PeerConnection:", err);
      audioTrack.stop(); // Stop the track if adding failed
      ms.getTracks().forEach(track => track.stop()); // Clean up the stream
      throw new Error(`Failed to add audio track: ${err.message}`); // Re-throw
  }

  const dc = pc.createDataChannel("oai-events");

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  const baseUrl = "https://api.openai.com/v1/realtime";
  const model = "gpt-4o-realtime-preview-2024-12-17";

  const sdpResponse = await fetch(`${baseUrl}?model=${model}`, {
    method: "POST",
    body: offer.sdp,
    headers: {
      Authorization: `Bearer ${EPHEMERAL_KEY}`,
      "Content-Type": "application/sdp",
    },
  });

  const answerSdp = await sdpResponse.text();
  const answer: RTCSessionDescriptionInit = {
    type: "answer",
    sdp: answerSdp,
  };

  await pc.setRemoteDescription(answer);

  return { pc, dc, audioTrack };
} 
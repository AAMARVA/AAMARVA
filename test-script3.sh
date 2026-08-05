#!/bin/bash
sed -i 's/setIsLoading(false);/setIsLoading(false); console.log("FETCHED MESSAGES:", data);/' src/components/ChatModal.tsx

import React, { useState, useEffect } from "react";
import { XCircle, Trash2 } from "lucide-react";

interface DeleteButtonProps {
    onDelete: () => void;
}

const DeleteButton: React.FC<DeleteButtonProps> = React.memo(({ onDelete }) => {
    const [confirming, setConfirming] = useState(false);

    useEffect(() => {
        if (confirming) {
            const timer = setTimeout(() => setConfirming(false), 3000);
            return () => clearTimeout(timer);
        }
    }, [confirming]);

    if (confirming) {
        return (
            <button
                onClick={(e) => {
                    e.stopPropagation();
                    onDelete();
                }}
                className="bg-red-600 text-white px-2 py-1 rounded text-xs font-bold animate-pulse flex items-center gap-1"
            >
                <XCircle className="w-3 h-3" />
            </button>
        );
    }

    return (
        <button
            onClick={(e) => {
                e.stopPropagation();
                setConfirming(true);
            }}
            className="text-slate-500 hover:text-red-400 p-1 transition-colors"
        >
            <Trash2 className="w-4 h-4" />
        </button>
    );
});

DeleteButton.displayName = "DeleteButton";

export default DeleteButton;

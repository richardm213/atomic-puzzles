import "./RowExpansionButton.css";

import { faChevronDown } from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";

type RowExpansionButtonProps = {
  expanded: boolean;
  label: string;
  onToggle: () => void;
};

export const RowExpansionButton = ({ expanded, label, onToggle }: RowExpansionButtonProps) => (
  <button
    type="button"
    className="rowExpansionButton"
    aria-expanded={expanded}
    aria-label={label}
    onClick={onToggle}
  >
    <FontAwesomeIcon icon={faChevronDown} aria-hidden="true" />
  </button>
);

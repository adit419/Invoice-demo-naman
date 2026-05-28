// ComponentHeader-style sticky header (antd) for the Matching screen.
// Extracted verbatim from the former monolithic matching.tsx.
import { Fragment } from "react";
import { ArrowLeftOutlined } from "@ant-design/icons";
import { Button as AntButton, Typography } from "antd";

const { Title } = Typography;

export function ComponentHeaderAntd({
  title,
  onBack,
  metaItems,
  right,
}: {
  title: string;
  onBack?: () => void;
  metaItems: { icon: React.ReactNode; text: string }[];
  right?: React.ReactNode;
}) {
  return (
    <div
      className="flex items-center justify-between flex-wrap gap-y-3 px-5 py-4 bg-white sticky top-0 z-10 border-b border-gray-200"
    >
      <div className="flex items-center gap-4 min-w-0">
        {onBack && (
          <AntButton type="text" icon={<ArrowLeftOutlined />} onClick={onBack} className="flex-shrink-0" />
        )}
        <div className="min-w-0">
          <Title level={4} className="!mb-0" style={{ margin: 0, lineHeight: 1.2 }}>
            {title}
          </Title>
          {metaItems.length > 0 && (
            <div className="flex items-center flex-wrap gap-x-2 gap-y-1 mt-0.5">
              {metaItems.map((item, index) => (
                <Fragment key={index}>
                  {index > 0 && <span className="text-gray-300 select-none">|</span>}
                  <span className="flex items-center gap-1 text-gray-500 text-sm">
                    {item.icon}
                    <span>{item.text}</span>
                  </span>
                </Fragment>
              ))}
            </div>
          )}
        </div>
      </div>
      {right && <div className="flex-shrink-0">{right}</div>}
    </div>
  );
}
